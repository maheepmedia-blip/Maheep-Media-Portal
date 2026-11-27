import crypto from 'node:crypto';
import { findCountryBySlug } from '../shared/countries.ts';
import { db } from './db.ts';
import {
  fetchAndParseFeed,
  fetchPublisherOgImage,
  resolveRealCommonsPhoto,
  stripHtmlPreserveParagraphs,
  titleSimilarity,
  validateExternalFeedUrl,
} from './rss.ts';
import { translateNewsItems } from './translator.ts';

export type WireScopeType = 'city' | 'state' | 'country';

export interface WireDispatchItem {
  id: string;
  scope_type: WireScopeType;
  scope_slug: string;
  scope_label: string;
  beat: string;
  title: string;
  summary: string;
  detailed_body: string;
  image_url: string;
  image_rights: string;
  source_name: string;
  source_url: string;
  author: string;
  language: string;
  published_at: string;
  is_curated?: boolean;
  slug?: string;
}

export interface ResolvedScopeMeta {
  scopeType: WireScopeType;
  scopeSlug: string;
  label: string;
  hiLabel?: string;
  sublabel: string;
  commonsQuery: string;
  commonsKeyword: string;
  cityId?: string;
  stateId?: string | null;
  stateName?: string;
  countryCategorySlug?: string;
  gl: string;
  ceid: string;
  lat?: number;
  lon?: number;
  census2011?: number;
  census2001?: number | null;
  changePct?: string;
  capital?: string;
  region?: string;
}

const HI_STATE_NAMES: Record<string, string> = {
  maharashtra: 'महाराष्ट्र',
  'uttar-pradesh': 'उत्तर प्रदेश',
  delhi: 'दिल्ली',
  karnataka: 'कर्नाटक',
  'tamil-nadu': 'तमिलनाडु',
  'west-bengal': 'पश्चिम बंगाल',
  gujarat: 'गुजरात',
  rajasthan: 'राजस्थान',
  bihar: 'बिहार',
  'madhya-pradesh': 'मध्य प्रदेश',
  telangana: 'तेलंगाना',
  'andhra-pradesh': 'आंध्र प्रदेश',
  kerala: 'केरल',
  punjab: 'पंजाब',
  haryana: 'हरियाणा',
  odisha: 'ओडिशा',
  jharkhand: 'झारखंड',
  chhattisgarh: 'छत्तीसगढ़',
  assam: 'असम',
  uttarakhand: 'उत्तराखंड',
  'himachal-pradesh': 'हिमाचल प्रदेश',
  'jammu-and-kashmir': 'जम्मू कश्मीर',
  goa: 'गोवा',
  tripura: 'त्रिपुरा',
  meghalaya: 'मेघालय',
  manipur: 'मणिपुर',
  nagaland: 'नागालैंड',
  'arunachal-pradesh': 'अरुणाचल प्रदेश',
  mizoram: 'मिजोरम',
  sikkim: 'सिक्किम',
  chandigarh: 'चंडीगढ़',
  puducherry: 'पुडुचेरी',
  ladakh: 'लद्दाख',
};

const HI_CITY_NAMES: Record<string, string> = {
  mumbai: 'मुंबई',
  delhi: 'दिल्ली',
  bengaluru: 'बेंगलुरु',
  hyderabad: 'हैदराबाद',
  chennai: 'चेन्नई',
  kolkata: 'कोलकाता',
  pune: 'पुणे',
  ahmedabad: 'अहमदाबाद',
  jaipur: 'जयपुर',
  lucknow: 'लखनऊ',
  kanpur: 'कानपुर',
  nagpur: 'नागपुर',
  indore: 'इंदौर',
  bhopal: 'भोपाल',
  patna: 'पटना',
  varanasi: 'वाराणसी',
  prayagraj: 'प्रयागराज',
  agra: 'आगरा',
  meerut: 'मेरठ',
  ghaziabad: 'गाजियाबाद',
  noida: 'नोएडा',
  ludhiana: 'लुधियाना',
  amritsar: 'अमृतसर',
  surat: 'सूरत',
  vadodara: 'वडोदरा',
  ranchi: 'रांची',
  raipur: 'रायपुर',
  bhubaneswar: 'भुवनेश्वर',
  guwahati: 'गुवाहाटी',
  chandigarh: 'चंडीगढ़',
  dehradun: 'देहरादून',
  srinagar: 'श्रीनगर',
  jammu: 'जम्मू',
  shimla: 'शिमला',
  agartala: 'अगरतला',
  thiruvananthapuram: 'तिरुवनंतपुरम',
  kochi: 'कोच्चि',
};

const SYNC_TTL_MS = 25 * 60_000;
const TARGET_MAX_DISPATCHES = 300;
const inflightSyncs = new Map<string, Promise<{ fetched: number; total: number }>>();

export function resolveScopeMeta(scopeType: WireScopeType, scopeSlug: string): ResolvedScopeMeta | null {
  const cleanSlug = scopeSlug.trim().toLowerCase();
  if (!cleanSlug) return null;

  if (scopeType === 'city') {
    const city = db
      .prepare(`
        SELECT ct.*, s.slug as state_slug
        FROM cities ct
        LEFT JOIN states s ON s.id = ct.state_id
        WHERE ct.slug = ?
      `)
      .get(cleanSlug) as
      | {
          id: string;
          name: string;
          slug: string;
          state_id: string | null;
          state_name: string;
          census_2011: number;
          census_2001: number | null;
          change_pct: string;
          lat: number;
          lon: number;
        }
      | undefined;
    if (!city) return null;
    const cleanCity = city.name.replace(/\s*\(town\)/i, '').trim();
    return {
      scopeType: 'city',
      scopeSlug: city.slug,
      label: cleanCity,
      hiLabel: HI_CITY_NAMES[city.slug],
      sublabel: `${city.state_name} · City Edition`,
      commonsQuery: `${cleanCity} ${city.state_name} India`,
      commonsKeyword: cleanCity,
      cityId: city.id,
      stateId: city.state_id,
      stateName: city.state_name,
      gl: 'IN',
      ceid: 'IN:en',
      lat: city.lat,
      lon: city.lon,
      census2011: city.census_2011,
      census2001: city.census_2001,
      changePct: city.change_pct,
    };
  }

  if (scopeType === 'state') {
    const state = db
      .prepare('SELECT id, name, slug, code, type FROM states WHERE slug = ?')
      .get(cleanSlug) as
      | { id: string; name: string; slug: string; code: string; type: string }
      | undefined;
    if (!state) return null;
    const capRow = db
      .prepare('SELECT name FROM cities WHERE state_id = ? AND is_capital = 1 ORDER BY census_2011 DESC LIMIT 1')
      .get(state.id) as { name: string } | undefined;
    const capitalName = capRow?.name ? capRow.name.replace(/\s*\(town\)/i, '').trim() : '';
    return {
      scopeType: 'state',
      scopeSlug: state.slug,
      label: state.name,
      hiLabel: HI_STATE_NAMES[state.slug],
      sublabel: capitalName
        ? `${state.type === 'ut' ? 'Union Territory' : 'State'} · Capital: ${capitalName}`
        : `${state.type === 'ut' ? 'Union Territory' : 'State'} · Code: ${state.code.toUpperCase()}`,
      commonsQuery: `${capitalName || state.name} ${state.name} India`,
      commonsKeyword: state.name,
      stateId: state.id,
      stateName: state.name,
      capital: capitalName || undefined,
      gl: 'IN',
      ceid: 'IN:en',
    };
  }

  const country = findCountryBySlug(cleanSlug);
  if (!country) return null;
  return {
    scopeType: 'country',
    scopeSlug: country.slug,
    label: country.name,
    hiLabel: country.hiName,
    sublabel: `${country.region} · Capital: ${country.capital}`,
    commonsQuery: country.commonsQuery,
    commonsKeyword: country.name,
    countryCategorySlug: country.slug === 'india' ? 'national' : 'international',
    capital: country.capital,
    region: country.region,
    gl: country.gl,
    ceid: country.ceid,
  };
}

function buildBeatQueries(
  meta: ResolvedScopeMeta,
  targetLang: 'en' | 'hi' = 'en',
): Array<{ beat: string; query: string; label: string }> {
  const qName = `"${meta.label}"`;
  const hiOrEn = meta.hiLabel ? `(${qName} OR "${meta.hiLabel}")` : qName;

  if (targetLang === 'hi') {
    const placeName = meta.hiLabel || meta.label;
    if (meta.scopeType === 'city') {
      const stHi = meta.stateName || 'भारत';
      return [
        { beat: 'top', query: `${hiOrEn} समाचार`, label: `${placeName} · प्रमुख समाचार` },
        { beat: 'governance', query: `${hiOrEn} नगर निगम मेट्रो ट्रैफिक प्रशासन`, label: `${placeName} · प्रशासन व सुविधाएं` },
        { beat: 'economy', query: `${hiOrEn} व्यापार उद्योग बाजार रोजगार`, label: `${placeName} · व्यापार व रोजगार` },
        { beat: 'society', query: `${hiOrEn} स्कूल कॉलेज शिक्षा अस्पताल स्वास्थ्य`, label: `${placeName} · शिक्षा व स्वास्थ्य` },
        { beat: 'law', query: `${hiOrEn} पुलिस अदालत कानून व्यवस्था`, label: `${placeName} · कानून व सुरक्षा` },
        { beat: 'culture', query: `${hiOrEn} खेल मौसम संस्कृति त्योहार`, label: `${placeName} · खेल व संस्कृति` },
        { beat: 'regional', query: `${hiOrEn} ${stHi} खबर when:90d`, label: `${placeName} · क्षेत्रीय आर्काइव` },
      ];
    }

    if (meta.scopeType === 'state') {
      return [
        { beat: 'top', query: `${hiOrEn} ताजा समाचार`, label: `${placeName} · राज्य मुख्य समाचार` },
        { beat: 'governance', query: `${hiOrEn} सरकार मुख्यमंत्री विधानसभा कैबिनेट नीति`, label: `${placeName} · शासन व नीति` },
        { beat: 'economy', query: `${hiOrEn} अर्थव्यवस्था उद्योग कृषि निवेश रोजगार`, label: `${placeName} · अर्थव्यवस्था व विकास` },
        { beat: 'society', query: `${hiOrEn} शिक्षा विश्वविद्यालय स्वास्थ्य अस्पताल योजना`, label: `${placeName} · शिक्षा व स्वास्थ्य` },
        { beat: 'law', query: `${hiOrEn} हाईकोर्ट पुलिस प्रशासन न्याय`, label: `${placeName} · कानून व न्याय` },
        { beat: 'culture', query: `${hiOrEn} पर्यटन खेल मौसम संस्कृति`, label: `${placeName} · खेल व संस्कृति` },
        { beat: 'regional', query: `${hiOrEn} जिला शहर समाचार when:90d`, label: `${placeName} · जिला आर्काइव` },
      ];
    }

    return [
      { beat: 'top', query: `${hiOrEn} ताजा समाचार सरकार`, label: `${placeName} · मुख्य समाचार` },
      { beat: 'governance', query: `${hiOrEn} राजनीति संसद राष्ट्रपति प्रधानमंत्री नीति`, label: `${placeName} · राजनीति व शासन` },
      { beat: 'economy', query: `${hiOrEn} अर्थव्यवस्था व्यापार बाजार महंगाई`, label: `${placeName} · अर्थव्यवस्था व बाजार` },
      { beat: 'society', query: `${hiOrEn} तकनीक विज्ञान जलवायु ऊर्जा स्वास्थ्य`, label: `${placeName} · विज्ञान व तकनीक` },
      { beat: 'law', query: `${hiOrEn} कूटनीति विदेश रक्षा सुरक्षा`, label: `${placeName} · कूटनीति व रक्षा` },
      { beat: 'culture', query: `${hiOrEn} शिक्षा खेल समाज संस्कृति`, label: `${placeName} · समाज व खेल` },
      { beat: 'regional', query: `${hiOrEn} समाचार when:60d`, label: `${placeName} · देश आर्काइव` },
    ];
  }

  if (meta.scopeType === 'city') {
    const st = meta.stateName || 'India';
    return [
      { beat: 'top', query: `${qName} ${st} news`, label: `${meta.label} · Top & Civic` },
      { beat: 'governance', query: `${qName} municipal metro traffic water civic`, label: `${meta.label} · Civic & Infra` },
      { beat: 'economy', query: `${qName} business economy industry jobs market`, label: `${meta.label} · Economy & Jobs` },
      { beat: 'society', query: `${qName} school college university hospital health`, label: `${meta.label} · Health & Education` },
      { beat: 'law', query: `${qName} police court administration order`, label: `${meta.label} · Law & Admin` },
      { beat: 'culture', query: `${qName} sports weather festival heritage`, label: `${meta.label} · Culture & Sports` },
      { beat: 'regional', query: `${qName} news when:90d`, label: `${meta.label} · Extended Archive` },
    ];
  }

  if (meta.scopeType === 'state') {
    return [
      { beat: 'top', query: `${qName} India news`, label: `${meta.label} · State Top Stories` },
      { beat: 'governance', query: `${qName} government cabinet assembly chief minister policy`, label: `${meta.label} · Governance & Policy` },
      { beat: 'economy', query: `${qName} economy industry agriculture infrastructure jobs`, label: `${meta.label} · Economy & Infra` },
      { beat: 'society', query: `${qName} education university hospital health scheme`, label: `${meta.label} · Health & Education` },
      { beat: 'law', query: `${qName} high court police administration order`, label: `${meta.label} · Law & Judiciary` },
      { beat: 'culture', query: `${qName} tourism sports festival weather`, label: `${meta.label} · Culture & Sports` },
      { beat: 'regional', query: `${qName} district city news when:90d`, label: `${meta.label} · District Archive` },
    ];
  }

  // Country (India for The Beacon or World countries for WorldWire)
  return [
    { beat: 'top', query: `${qName} breaking news government`, label: `${meta.label} · Top Dispatches` },
    { beat: 'governance', query: `${qName} politics parliament president prime minister policy`, label: `${meta.label} · Politics & Policy` },
    { beat: 'economy', query: `${qName} economy trade markets inflation central bank`, label: `${meta.label} · Economy & Markets` },
    { beat: 'society', query: `${qName} technology science climate energy health`, label: `${meta.label} · Tech, Science & Climate` },
    { beat: 'law', query: `${qName} diplomacy foreign policy defence security`, label: `${meta.label} · Diplomacy & Security` },
    { beat: 'culture', query: `${qName} education sports culture society`, label: `${meta.label} · Society & Sports` },
    { beat: 'regional', query: `${qName} news when:60d`, label: `${meta.label} · Country Archive` },
  ];
}

function makeGoogleNewsSearchUrl(
  query: string,
  gl: string,
  ceid: string,
  targetLang: 'en' | 'hi' = 'en',
): string {
  if (targetLang === 'hi') {
    return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=hi&gl=IN&ceid=${encodeURIComponent('IN:hi')}`;
  }
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=${encodeURIComponent(gl)}&ceid=${encodeURIComponent(ceid)}`;
}

function buildDetailedFallbackBody(params: {
  title: string;
  summary: string;
  scopeLabel: string;
  beatLabel: string;
  sourceName: string;
  targetLang?: 'en' | 'hi';
}): string {
  const cleanSummary = (params.summary || params.title).trim();
  const lines: string[] = [cleanSummary];
  if (params.targetLang === 'hi') {
    lines.push(`${params.beatLabel} — स्रोत: ${params.sourceName || 'सत्यापित न्यूज़ वायर'} (${params.scopeLabel})।`);
    lines.push('पूरी रिपोर्ट विस्तार से पढ़ने के लिए नीचे "Read Full Publisher Dispatch" पर क्लिक करें।');
  } else {
    lines.push(
      `${params.beatLabel} — Reported by ${params.sourceName || 'Verified Wire'} for ${params.scopeLabel}.`,
    );
    lines.push(
      `Click "Read Full Publisher Dispatch" below to load the full source report or expand complete article paragraphs from the original publisher.`,
    );
  }
  return lines.join('\n\n');
}

export async function syncScope300Wire(
  scopeType: WireScopeType,
  scopeSlug: string,
  forceRefresh = false,
  targetLang: 'en' | 'hi' = 'en',
): Promise<{ fetched: number; total: number }> {
  const meta = resolveScopeMeta(scopeType, scopeSlug);
  if (!meta) return { fetched: 0, total: 0 };

  const scopeKey = `${meta.scopeType}:${meta.scopeSlug}:${targetLang}`;
  const existingCount = (
    db
      .prepare('SELECT COUNT(*) as c FROM wire_dispatches WHERE scope_type = ? AND scope_slug = ? AND language = ?')
      .get(meta.scopeType, meta.scopeSlug, targetLang) as { c: number }
  ).c;

  if (!forceRefresh && existingCount >= 220) {
    const syncRow = db
      .prepare('SELECT last_synced_at FROM wire_sync_log WHERE scope_key = ?')
      .get(scopeKey) as { last_synced_at: string } | undefined;
    if (syncRow?.last_synced_at) {
      const ageMs = Date.now() - new Date(syncRow.last_synced_at).getTime();
      if (!Number.isNaN(ageMs) && ageMs < SYNC_TTL_MS) {
        return { fetched: 0, total: existingCount };
      }
    }
  }

  const running = inflightSyncs.get(scopeKey);
  if (running) return running;

  const jobPromise = (async () => {
    try {
      const beatSpecs = buildBeatQueries(meta, targetLang);
      const feedResults = await Promise.allSettled(
        beatSpecs.map(async (spec) => {
          const url = makeGoogleNewsSearchUrl(spec.query, meta.gl, meta.ceid, targetLang);
          const items = await fetchAndParseFeed(url, `${meta.label} Wire`, 100);
          return { spec, items };
        }),
      );

      const candidates: Array<{
        beat: string;
        scopeLabel: string;
        title: string;
        summary: string;
        detailedBody: string;
        imageUrl: string;
        imageRights: string;
        sourceName: string;
        sourceUrl: string;
        publishedAt: string;
      }> = [];

      const seenUrls = new Set<string>();
      const seenTitles: string[] = [];

      for (const res of feedResults) {
        if (res.status !== 'fulfilled') continue;
        const { spec, items } = res.value;
        for (const item of items) {
          if (!item.title || item.title.length < 8 || !item.link) continue;
          if (seenUrls.has(item.link)) continue;
          const normTitle = item.title.toLowerCase();
          if (seenTitles.some((t) => t === normTitle || titleSimilarity(t, normTitle) >= 0.8)) {
            continue;
          }
          seenUrls.add(item.link);
          seenTitles.push(normTitle);
          candidates.push({
            beat: spec.beat,
            scopeLabel: spec.label,
            title: item.title,
            summary: item.summary || item.title,
            detailedBody:
              item.fullContent.length > (item.summary || '').length + 40
                ? item.fullContent
                : buildDetailedFallbackBody({
                    title: item.title,
                    summary: item.summary,
                    scopeLabel: meta.label,
                    beatLabel: spec.label,
                    sourceName: item.sourceName,
                    targetLang,
                  }),
            imageUrl: item.imageUrl || '',
            imageRights: item.imageRights || '',
            sourceName: item.sourceName,
            sourceUrl: item.link,
            publishedAt: item.publishedAt,
          });
          if (candidates.length >= 340) break;
        }
        if (candidates.length >= 340) break;
      }

      // If a small town returned fewer than 260 exact matches, supplement cleanly with parent state dispatches tagged as 'regional'
      if (meta.scopeType === 'city' && meta.stateName && candidates.length < 280) {
        try {
          const stSlug = meta.stateName.toLowerCase().replace(/\s+/g, '-');
          const stHi = HI_STATE_NAMES[stSlug];
          const stateQuery =
            targetLang === 'hi'
              ? stHi
                ? `("${meta.stateName}" OR "${stHi}") जिला क्षेत्रीय समाचार`
                : `"${meta.stateName}" जिला समाचार`
              : `"${meta.stateName}" regional district news`;
          const stateUrl = makeGoogleNewsSearchUrl(stateQuery, meta.gl, meta.ceid, targetLang);
          const extra = await fetchAndParseFeed(stateUrl, `${meta.stateName} Regional Desk`, 100);
          for (const item of extra) {
            if (candidates.length >= 320) break;
            if (!item.title || item.title.length < 8 || !item.link) continue;
            if (seenUrls.has(item.link)) continue;
            const normTitle = item.title.toLowerCase();
            if (seenTitles.some((t) => t === normTitle || titleSimilarity(t, normTitle) >= 0.8)) continue;
            seenUrls.add(item.link);
            seenTitles.push(normTitle);
            candidates.push({
              beat: 'regional',
              scopeLabel:
                targetLang === 'hi'
                  ? `${stHi || meta.stateName} · क्षेत्रीय डेस्क`
                  : `${meta.stateName} Regional Desk`,
              title: item.title,
              summary: item.summary || item.title,
              detailedBody: buildDetailedFallbackBody({
                title: item.title,
                summary: item.summary,
                scopeLabel: `${meta.hiLabel || meta.label} (${meta.stateName})`,
                beatLabel:
                  targetLang === 'hi'
                    ? `${stHi || meta.stateName} क्षेत्रीय डेस्क`
                    : `${meta.stateName} Regional Desk`,
                sourceName: item.sourceName,
                targetLang,
              }),
              imageUrl: item.imageUrl || '',
              imageRights: item.imageRights || '',
              sourceName: item.sourceName,
              sourceUrl: item.link,
              publishedAt: item.publishedAt,
            });
          }
        } catch {
          // Ignore supplemental fetch failure
        }
      }

      // Resolve one real Wikimedia Commons documentary photo for leads missing an image
      let fallbackPhoto: { imageUrl: string; imageRights: string } | null = null;
      if (candidates.some((c) => !c.imageUrl)) {
        fallbackPhoto =
          (await resolveRealCommonsPhoto(meta.commonsQuery, meta.commonsKeyword)) ||
          (meta.stateName ? await resolveRealCommonsPhoto(`${meta.stateName} India`, meta.stateName) : null);
      }

      const upsertStmt = db.prepare(`
        INSERT INTO wire_dispatches (
          id, scope_type, scope_slug, scope_label, beat, title, summary, detailed_body,
          image_url, image_rights, source_name, source_url, author, language, published_at, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(scope_type, scope_slug, source_url) DO UPDATE SET
          beat = excluded.beat,
          scope_label = excluded.scope_label,
          language = excluded.language,
          summary = CASE WHEN length(excluded.summary) > length(wire_dispatches.summary) THEN excluded.summary ELSE wire_dispatches.summary END,
          image_url = CASE WHEN wire_dispatches.image_url = '' THEN excluded.image_url ELSE wire_dispatches.image_url END,
          image_rights = CASE WHEN wire_dispatches.image_rights = '' THEN excluded.image_rights ELSE wire_dispatches.image_rights END,
          fetched_at = datetime('now')
      `);

      const saveTx = db.transaction(() => {
        candidates.forEach((c, idx) => {
          const img = c.imageUrl || (idx < 30 && fallbackPhoto ? fallbackPhoto.imageUrl : '');
          const rights = c.imageUrl
            ? c.imageRights
            : idx < 30 && fallbackPhoto
              ? fallbackPhoto.imageRights
              : '';
          const id = `wd-${crypto
            .createHash('sha1')
            .update(`${meta.scopeType}|${meta.scopeSlug}|${targetLang}|${c.sourceUrl}`)
            .digest('hex')
            .slice(0, 14)}`;
          upsertStmt.run(
            id,
            meta.scopeType,
            meta.scopeSlug,
            c.scopeLabel,
            c.beat,
            c.title,
            c.summary,
            c.detailedBody,
            img,
            rights,
            c.sourceName,
            c.sourceUrl,
            c.sourceName,
            targetLang,
            c.publishedAt,
          );
        });

        // Keep newest 360 cached dispatches per (scope, language)
        db.prepare(`
          DELETE FROM wire_dispatches
          WHERE scope_type = ? AND scope_slug = ? AND language = ?
            AND id NOT IN (
              SELECT id FROM wire_dispatches
              WHERE scope_type = ? AND scope_slug = ? AND language = ?
              ORDER BY published_at DESC
              LIMIT 360
            )
        `).run(meta.scopeType, meta.scopeSlug, targetLang, meta.scopeType, meta.scopeSlug, targetLang);

        const finalTotal = (
          db
            .prepare('SELECT COUNT(*) as c FROM wire_dispatches WHERE scope_type = ? AND scope_slug = ? AND language = ?')
            .get(meta.scopeType, meta.scopeSlug, targetLang) as { c: number }
        ).c;

        db.prepare(`
          INSERT INTO wire_sync_log (scope_key, last_synced_at, total_count)
          VALUES (?, ?, ?)
          ON CONFLICT(scope_key) DO UPDATE SET
            last_synced_at = excluded.last_synced_at,
            total_count = excluded.total_count
        `).run(scopeKey, new Date().toISOString(), finalTotal);

        return finalTotal;
      });

      const finalTotal = saveTx();
      return { fetched: candidates.length, total: finalTotal };
    } finally {
      inflightSyncs.delete(scopeKey);
    }
  })();

  inflightSyncs.set(scopeKey, jobPromise);
  return jobPromise;
}

export async function getPagedScopeWire(params: {
  scopeType: WireScopeType;
  scopeSlug: string;
  page?: number;
  pageSize?: number;
  beat?: string;
  q?: string;
  date?: string;
  lang?: 'all' | 'en' | 'hi';
  forceRefresh?: boolean;
}) {
  const meta = resolveScopeMeta(params.scopeType, params.scopeSlug);
  if (!meta) return null;

  const langFilter: 'all' | 'en' | 'hi' =
    params.lang === 'hi' || params.lang === 'en' ? params.lang : 'all';
  // Canonical 300-story set always keeps identical dispatches regardless of selected display language
  const syncLang: 'en' | 'hi' = 'en';

  const currentCached = (
    db
      .prepare('SELECT COUNT(*) as c FROM wire_dispatches WHERE scope_type = ? AND scope_slug = ? AND language = ?')
      .get(meta.scopeType, meta.scopeSlug, syncLang) as { c: number }
  ).c;

  let syncResult = { fetched: 0, total: currentCached };
  if (params.forceRefresh || currentCached < 150) {
    syncResult = await syncScope300Wire(meta.scopeType, meta.scopeSlug, Boolean(params.forceRefresh), syncLang);
  }

  // Merge canonical curated DB articles belonging to this city / state / country first (no language exclusion)
  let curatedRows: Array<Record<string, unknown>> = [];
  if (meta.scopeType === 'city' && meta.cityId) {
    curatedRows = db
      .prepare(`
        SELECT a.id, a.title, a.slug, a.summary, a.content, a.image_url, a.image_rights, a.source_name, a.source_url, a.author, a.language, a.subtopic, a.published_at,
               c.slug as category_slug
        FROM articles a
        LEFT JOIN categories c ON c.id = a.category_id
        WHERE a.status = 'published' AND (a.city_id = ? OR a.state_id = ?)
        ORDER BY CASE WHEN a.city_id = ? THEN 0 ELSE 1 END, a.published_at DESC
        LIMIT 60
      `)
      .all(meta.cityId, meta.stateId || '', meta.cityId) as Array<Record<string, unknown>>;
  } else if (meta.scopeType === 'state' && meta.stateId) {
    curatedRows = db
      .prepare(`
        SELECT a.id, a.title, a.slug, a.summary, a.content, a.image_url, a.image_rights, a.source_name, a.source_url, a.author, a.language, a.subtopic, a.published_at,
               c.slug as category_slug
        FROM articles a
        LEFT JOIN categories c ON c.id = a.category_id
        WHERE a.status = 'published' AND a.state_id = ?
        ORDER BY a.published_at DESC
        LIMIT 80
      `)
      .all(meta.stateId) as Array<Record<string, unknown>>;
  } else if (meta.scopeType === 'country' && meta.countryCategorySlug) {
    const likePattern = `%${meta.label.toLowerCase()}%`;
    const hiLikePattern = meta.hiLabel ? `%${meta.hiLabel}%` : likePattern;
    curatedRows = db
      .prepare(`
        SELECT a.id, a.title, a.slug, a.summary, a.content, a.image_url, a.image_rights, a.source_name, a.source_url, a.author, a.language, a.subtopic, a.published_at,
               c.slug as category_slug
        FROM articles a
        LEFT JOIN categories c ON c.id = a.category_id
        WHERE a.status = 'published'
          AND (
            c.slug = ?
            OR LOWER(a.title) LIKE ?
            OR LOWER(a.summary) LIKE ?
            OR a.title LIKE ?
            OR a.summary LIKE ?
          )
        ORDER BY CASE WHEN LOWER(a.title) LIKE ? OR a.title LIKE ? THEN 0 ELSE 1 END, a.published_at DESC
        LIMIT 80
      `)
      .all(
        meta.countryCategorySlug,
        likePattern,
        likePattern,
        hiLikePattern,
        hiLikePattern,
        likePattern,
        hiLikePattern,
      ) as Array<Record<string, unknown>>;
  }

  const wireRows = db
    .prepare(`
      SELECT id, scope_type, scope_slug, scope_label, beat, title, summary, detailed_body,
             image_url, image_rights, source_name, source_url, author, language, published_at
      FROM wire_dispatches
      WHERE scope_type = ? AND scope_slug = ? AND language = 'en'
      ORDER BY published_at DESC
      LIMIT 340
    `)
    .all(meta.scopeType, meta.scopeSlug) as WireDispatchItem[];

  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const merged: WireDispatchItem[] = [];

  for (const r of curatedRows) {
    const title = String(r.title || '').trim();
    const url = String(r.source_url || '').trim();
    const normTitle = title.toLowerCase();
    if (!title || seenTitles.has(normTitle)) continue;
    if (url && seenUrls.has(url)) continue;
    seenTitles.add(normTitle);
    if (url) seenUrls.add(url);

    const catSlug = String(r.category_slug || '');
    const mappedBeat =
      catSlug === 'business'
        ? 'economy'
        : catSlug === 'sports' || catSlug === 'entertainment'
          ? 'culture'
          : catSlug === 'education' || catSlug === 'science' || catSlug === 'technology'
            ? 'society'
            : 'top';

    merged.push({
      id: String(r.id),
      scope_type: meta.scopeType,
      scope_slug: meta.scopeSlug,
      scope_label: String(r.subtopic || `${meta.label} · Newsroom Report`),
      beat: mappedBeat,
      title,
      summary: String(r.summary || title),
      detailed_body: String(r.content || r.summary || title),
      image_url: String(r.image_url || ''),
      image_rights: String(r.image_rights || ''),
      source_name: String(r.source_name || 'Maheep Desk'),
      source_url: url,
      author: String(r.author || 'Maheep Bureau'),
      language: String(r.language || 'en'),
      published_at: String(r.published_at || new Date().toISOString()),
      is_curated: true,
      slug: String(r.slug || ''),
    });
  }

  for (const w of wireRows) {
    const normTitle = w.title.trim().toLowerCase();
    if (seenTitles.has(normTitle)) continue;
    if (w.source_url && seenUrls.has(w.source_url)) continue;
    seenTitles.add(normTitle);
    if (w.source_url) seenUrls.add(w.source_url);
    merged.push(w);
    if (merged.length >= TARGET_MAX_DISPATCHES) break;
  }

  merged.sort((a, b) => (a.published_at < b.published_at ? 1 : -1));
  const capped = merged.slice(0, TARGET_MAX_DISPATCHES);

  const beatCounts: Record<string, number> = {
    all: capped.length,
    top: 0,
    governance: 0,
    economy: 0,
    society: 0,
    law: 0,
    culture: 0,
    regional: 0,
  };
  const dateMap = new Map<string, number>();

  for (const item of capped) {
    beatCounts[item.beat] = (beatCounts[item.beat] || 0) + 1;
    try {
      const d = new Date(item.published_at);
      if (!Number.isNaN(d.getTime())) {
        const istDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
        dateMap.set(istDate, (dateMap.get(istDate) || 0) + 1);
      }
    } catch {
      // Ignore invalid date
    }
  }

  const beatFilter = (params.beat || 'all').trim().toLowerCase();
  const qFilter = (params.q || '').trim().toLowerCase();
  const dateFilter = /^\d{4}-\d{2}-\d{2}$/.test(params.date || '') ? String(params.date) : '';

  const filtered = capped.filter((item) => {
    if (beatFilter !== 'all' && item.beat !== beatFilter) return false;
    if (qFilter) {
      const hay = `${item.title} ${item.summary} ${item.source_name} ${item.scope_label}`.toLowerCase();
      if (!hay.includes(qFilter)) return false;
    }
    if (dateFilter) {
      try {
        const istDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
          new Date(item.published_at),
        );
        if (istDate !== dateFilter) return false;
      } catch {
        return false;
      }
    }
    return true;
  });

  const pageSize = Math.min(40, Math.max(10, Number(params.pageSize) || 12));
  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number(params.page) || 1));
  const startIdx = (page - 1) * pageSize;
  const rawDispatches = filtered.slice(startIdx, startIdx + pageSize);

  // Translate ONLY the current page's 10-15 stories into the requested language so news stories stay identical
  const dispatches =
    langFilter === 'hi' || langFilter === 'en'
      ? await translateNewsItems(rawDispatches, langFilter, { translateBody: false, maxLive: 20 })
      : rawDispatches;

  const localizedScope =
    langFilter === 'hi' && meta.hiLabel
      ? {
          ...meta,
          label: meta.hiLabel,
          sublabel:
            meta.scopeType === 'city'
              ? `${meta.stateName || ''} · शहर संस्करण`
              : meta.scopeType === 'state'
                ? `${meta.capital ? `राजधानी: ${meta.capital} · ` : ''}राज्य संस्करण`
                : `${meta.region || 'विश्व'} · राजधानी: ${meta.capital || ''}`,
        }
      : meta;

  const availableDates = Array.from(dateMap.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 30)
    .map(([date, count]) => ({ date, count }));

  const syncRow = db
    .prepare('SELECT last_synced_at FROM wire_sync_log WHERE scope_key = ?')
    .get(`${meta.scopeType}:${meta.scopeSlug}:en`) as { last_synced_at: string } | undefined;

  return {
    scope: localizedScope,
    totalAvailable: capped.length,
    totalFiltered,
    maxTarget: TARGET_MAX_DISPATCHES,
    page,
    pageSize,
    totalPages,
    beatCounts,
    availableDates,
    dispatches,
    syncStatus: {
      lastSyncedAt: syncRow?.last_synced_at || new Date().toISOString(),
      fetchedNow: syncResult.fetched,
    },
  };
}

export async function getExpandedDispatchDetail(
  id: string,
  targetLang: 'all' | 'en' | 'hi' = 'all',
): Promise<{
  id: string;
  title: string;
  summary: string;
  paragraphs: string[];
  imageUrl: string;
  imageRights: string;
  sourceName: string;
  sourceUrl: string;
  author: string;
  publishedAt: string;
  scopeLabel: string;
} | null> {
  const cleanId = id.trim();
  if (!cleanId) return null;

  const curated = db
    .prepare(`
      SELECT a.*, c.name as category_name
      FROM articles a
      LEFT JOIN categories c ON c.id = a.category_id
      WHERE a.id = ? OR a.slug = ?
    `)
    .get(cleanId, cleanId) as Record<string, unknown> | undefined;

  if (curated) {
    let outTitle = String(curated.title || '');
    let outSummary = String(curated.summary || '');
    const rawBody = String(curated.content || curated.summary || curated.title || '');
    let paragraphs = rawBody.split(/\n+/).map((p) => p.trim()).filter(Boolean);

    if (targetLang === 'hi' || targetLang === 'en') {
      const [translated] = await translateNewsItems(
        [
          {
            id: String(curated.id),
            title: outTitle,
            summary: outSummary,
            detailed_body: paragraphs.join('\n\n'),
            source_name: String(curated.source_name || 'Maheep Bureau'),
          },
        ],
        targetLang,
        { translateBody: true, maxLive: 1 },
      );
      if (translated) {
        outTitle = translated.title;
        outSummary = String(translated.summary || outSummary);
        const tParas = String(translated.detailed_body || '')
          .split(/\n+/)
          .map((p) => p.trim())
          .filter(Boolean);
        if (tParas.length > 0) paragraphs = tParas;
      }
    }

    return {
      id: String(curated.id),
      title: outTitle,
      summary: outSummary,
      paragraphs,
      imageUrl: String(curated.image_url || ''),
      imageRights: String(curated.image_rights || ''),
      sourceName: String(curated.source_name || 'Maheep Bureau'),
      sourceUrl: String(curated.source_url || ''),
      author: String(curated.author || 'Editorial Desk'),
      publishedAt: String(curated.published_at || ''),
      scopeLabel: String(curated.subtopic || curated.category_name || 'Maheep Report'),
    };
  }

  const wire = db
    .prepare('SELECT * FROM wire_dispatches WHERE id = ?')
    .get(cleanId) as WireDispatchItem | undefined;
  if (!wire) return null;

  let detailedBody = wire.detailed_body || wire.summary || wire.title;
  let imageUrl = wire.image_url;
  let imageRights = wire.image_rights;

  const needsScrape =
    wire.source_url &&
    !wire.source_url.includes('news.google.com') &&
    detailedBody.length < 480;

  if (needsScrape) {
    try {
      const validated = validateExternalFeedUrl(wire.source_url);
      const res = await fetch(validated.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MaheepNewsReader/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const html = await res.text();
        const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
        const scopeHtml = articleMatch ? articleMatch[1] : html;
        const pMatches = Array.from(scopeHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
          .map((m) => stripHtmlPreserveParagraphs(m[1]).trim())
          .filter((p) => p.length > 55 && !/cookie|subscribe|sign in|javascript|all rights reserved/i.test(p))
          .slice(0, 12);

        if (pMatches.length >= 2) {
          detailedBody = pMatches.join('\n\n');
          if (!imageUrl) {
            const og = await fetchPublisherOgImage(wire.source_url, wire.source_name || 'Publisher');
            if (og.imageUrl) {
              imageUrl = og.imageUrl;
              imageRights = og.imageRights;
            }
          }
          db.prepare(
            'UPDATE wire_dispatches SET detailed_body = ?, image_url = ?, image_rights = ? WHERE id = ?',
          ).run(detailedBody, imageUrl, imageRights, wire.id);
        }
      }
    } catch {
      // Keep clean cached summary & source attribution
    }
  }

  let outTitle = wire.title;
  let outSummary = wire.summary;
  let paragraphs = detailedBody.split(/\n+/).map((p) => p.trim()).filter(Boolean);

  if (targetLang === 'hi' || targetLang === 'en') {
    const [translated] = await translateNewsItems(
      [
        {
          id: wire.id,
          title: outTitle,
          summary: outSummary,
          detailed_body: paragraphs.join('\n\n'),
          source_name: wire.source_name,
        },
      ],
      targetLang,
      { translateBody: true, maxLive: 1 },
    );
    if (translated) {
      outTitle = translated.title;
      outSummary = String(translated.summary || outSummary);
      const tParas = String(translated.detailed_body || '')
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (tParas.length > 0) paragraphs = tParas;
    }
  }

  return {
    id: wire.id,
    title: outTitle,
    summary: outSummary,
    paragraphs,
    imageUrl,
    imageRights,
    sourceName: wire.source_name,
    sourceUrl: wire.source_url,
    author: wire.author || wire.source_name || 'Wire Correspondent',
    publishedAt: wire.published_at,
    scopeLabel: wire.scope_label,
  };
}
