import crypto from 'node:crypto';
import net from 'node:net';
import { XMLParser } from 'fast-xml-parser';
import { db, getSetting, setSetting } from './db.ts';
import { generateEditionForDate } from './epaper.ts';
import { runEditorialAiAssist } from './gemini.ts';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
});

const WIKIMEDIA_UA = 'MaheepNewsPortal/1.0 (https://maheepnews.in; maheepmedia@gmail.com)';
const PROXY_REQUIRED_HOSTS = new Set([
  'upload.wikimedia.org',
  'thumb.wikimedia.org',
  'c.ndtvimg.com',
  'www.hindustantimes.com',
]);

export function formatDisplayImageUrl(rawUrl: string): string {
  const clean = (rawUrl || '').trim();
  if (!clean) return '';
  if (clean.startsWith('/api/media/photo?')) return clean;
  try {
    const parsed = new URL(clean);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    if (PROXY_REQUIRED_HOSTS.has(parsed.hostname.toLowerCase())) {
      return `/api/media/photo?u=${encodeURIComponent(parsed.toString())}`;
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

function isUsablePhotoUrl(rawUrl: string): boolean {
  const u = (rawUrl || '').trim();
  if (!u || !u.startsWith('http')) return false;
  const lower = u.toLowerCase();
  if (
    lower.includes('lh3.googleusercontent.com') ||
    lower.includes('news.google.com') ||
    lower.includes('favicon') ||
    lower.includes('/logo/') ||
    lower.includes('/theme/images/og-image') ||
    lower.includes('og-image.png') ||
    lower.includes('default-image') ||
    lower.includes('1x1') ||
    lower.includes('pixel') ||
    lower.includes('.svg')
  ) {
    return false;
  }
  return true;
}

function upgradeNewsImageResolution(rawUrl: string): string {
  let u = rawUrl.trim();
  // BBC iChef 240px RSS thumbnail -> crisp 976px edition photo
  if (u.includes('ichef.bbci.co.uk/ace/') && /\/240\//.test(u)) {
    u = u.replace(/\/240\//, '/976/');
  }
  // The Hindu smaller landscape -> crisp 1200px landscape
  if (u.includes('th-i.thgim.com') && /\/LANDSCAPE_(300|660)\//.test(u)) {
    u = u.replace(/\/LANDSCAPE_(300|660)\//, '/LANDSCAPE_1200/');
  }
  return u;
}

function extractTextValue(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'object' && '#text' in (val as Record<string, unknown>)) {
    return String((val as Record<string, unknown>)['#text'] || '').trim();
  }
  return '';
}

function extractRssItemMedia(
  item: Record<string, unknown>,
  rawHtmlBody: string,
  itemSource: string,
): { imageUrl: string; imageRights: string } {
  const candidates: Array<{ url: string; width: number; credit?: string }> = [];

  const collectMediaNode = (node: unknown) => {
    if (!node) return;
    const list = Array.isArray(node) ? node : [node];
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      const obj = entry as Record<string, unknown>;
      const url = String(obj['@_url'] || '').trim();
      const medium = String(obj['@_medium'] || '').toLowerCase();
      const type = String(obj['@_type'] || '').toLowerCase();
      const width = Number(obj['@_width'] || 0) || 0;
      const credit = extractTextValue(obj['media:credit']) || extractTextValue(obj['media:copyright']);
      if (url && (!medium || medium === 'image' || type.startsWith('image/'))) {
        candidates.push({ url, width, credit });
      }
    }
  };

  collectMediaNode(item['media:content']);
  if (item['media:group'] && typeof item['media:group'] === 'object') {
    const grp = item['media:group'] as Record<string, unknown>;
    collectMediaNode(grp['media:content']);
    collectMediaNode(grp['media:thumbnail']);
  }
  collectMediaNode(item['media:thumbnail']);
  collectMediaNode(item.enclosure);

  if (candidates.length === 0 && rawHtmlBody) {
    const imgMatch = rawHtmlBody.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
    if (imgMatch?.[1]) {
      candidates.push({ url: imgMatch[1], width: 800 });
    }
  }

  const valid = candidates.filter((c) => isUsablePhotoUrl(c.url));
  if (valid.length === 0) {
    return { imageUrl: '', imageRights: '' };
  }

  valid.sort((a, b) => b.width - a.width);
  const best = valid[0];
  const upgraded = upgradeNewsImageResolution(best.url);
  const formatted = formatDisplayImageUrl(upgraded);
  if (!formatted) return { imageUrl: '', imageRights: '' };

  const creditText = best.credit
    ? `Photo: ${best.credit} (${itemSource})`
    : `Photo: ${itemSource}`;
  return { imageUrl: formatted, imageRights: creditText };
}

export async function fetchPublisherOgImage(
  articleUrl: string,
  sourceName: string,
): Promise<{ imageUrl: string; imageRights: string }> {
  try {
    const parsed = validateExternalFeedUrl(articleUrl);
    if (parsed.hostname.includes('news.google.com')) {
      return { imageUrl: '', imageRights: '' };
    }
    const res = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return { imageUrl: '', imageRights: '' };
    const html = await res.text();
    const ogMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    const rawImg = ogMatch?.[1]?.trim() || '';
    if (!isUsablePhotoUrl(rawImg)) return { imageUrl: '', imageRights: '' };
    const upgraded = upgradeNewsImageResolution(rawImg);
    const formatted = formatDisplayImageUrl(upgraded);
    if (!formatted) return { imageUrl: '', imageRights: '' };
    return { imageUrl: formatted, imageRights: `Photo: ${sourceName}` };
  } catch {
    return { imageUrl: '', imageRights: '' };
  }
}

const commonsPhotoCache = new Map<string, { imageUrl: string; imageRights: string } | null>();

export async function resolveRealCommonsPhoto(
  query: string,
  preferredKeyword?: string,
): Promise<{ imageUrl: string; imageRights: string } | null> {
  const key = `${query.trim().toLowerCase()}|${(preferredKeyword || '').toLowerCase()}`;
  if (commonsPhotoCache.has(key)) {
    return commonsPhotoCache.get(key) || null;
  }

  try {
    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
      query,
    )}&gsrlimit=8&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1280&format=json`;
    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': WIKIMEDIA_UA },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      commonsPhotoCache.set(key, null);
      return null;
    }
    const json = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            title?: string;
            imageinfo?: Array<{
              url?: string;
              thumburl?: string;
              width?: number;
              height?: number;
              mime?: string;
              extmetadata?: {
                Artist?: { value?: string };
                LicenseShortName?: { value?: string };
              };
            }>;
          }
        >;
      };
    };

    const pages = Object.values(json?.query?.pages || {});
    const badPattern =
      /\b(map|diagram|chart|flag|seal|emblem|logo|coat of arms|svg|icon|signature|passport|stamp|plan|australia|canberra|election\s+results)\b/i;

    const validItems = pages
      .map((p) => {
        const info = p.imageinfo?.[0];
        if (!info || info.mime !== 'image/jpeg') return null;
        if (!info.width || !info.height || info.width < 900 || info.height < 480) return null;
        if (info.width / info.height < 1.15) return null;
        if (badPattern.test(p.title || '')) return null;
        const rawUrl = info.thumburl || info.url || '';
        if (!rawUrl) return null;
        const rawArtist = info.extmetadata?.Artist?.value || '';
        const artist = rawArtist.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 55);
        const license = info.extmetadata?.LicenseShortName?.value || 'Wikimedia Commons';
        const rights = artist
          ? `Photo: ${artist} · ${license} (Wikimedia Commons)`
          : `Wikimedia Commons (${license})`;
        const titleLower = (p.title || '').toLowerCase();
        const score = preferredKeyword && titleLower.includes(preferredKeyword.toLowerCase()) ? 2 : 1;
        return {
          imageUrl: formatDisplayImageUrl(rawUrl),
          imageRights: rights,
          score,
        };
      })
      .filter((x): x is { imageUrl: string; imageRights: string; score: number } => Boolean(x && x.imageUrl))
      .sort((a, b) => b.score - a.score);

    const best = validItems[0] ? { imageUrl: validItems[0].imageUrl, imageRights: validItems[0].imageRights } : null;
    commonsPhotoCache.set(key, best);
    return best;
  } catch {
    commonsPhotoCache.set(key, null);
    return null;
  }
}

export function validateExternalFeedUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Invalid feed URL format.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only HTTP and HTTPS feed URLs are allowed.');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '169.254.169.254' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new Error('Local or private network addresses are not permitted.');
  }
  if (net.isIPv4(host)) {
    const parts = host.split('.').map(Number);
    if (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254)
    ) {
      throw new Error('Private IP ranges are not permitted.');
    }
  }
  return parsed;
}

export function normalizeArticleUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = '';
    const dropParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'oc'];
    for (const p of dropParams) u.searchParams.delete(p);
    return u.toString();
  } catch {
    return raw.trim();
  }
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

export function titleSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function createSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 72);
  return `${base || 'dispatch'}-${crypto.randomBytes(3).toString('hex')}`;
}

function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtmlPreserveParagraphs(raw: string): string {
  return raw
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function detectBreakingCandidate(title: string, summary: string): boolean {
  const combined = `${title} ${summary}`.toLowerCase();
  const urgentSignals = [
    'breaking',
    'supreme court verdict',
    'parliament passes',
    'cabinet approves',
    'rbi repo rate',
    'cyclone alert',
    'red alert',
    'earthquake',
    'isro launch',
    'election commission',
    'budget',
    'pm modi',
    'ब्रेकिंग',
    'सुप्रीम कोर्ट',
    'कैबिनेट',
    'अलर्ट',
    'भूकंप',
    'इसरो',
    'आरबीआई',
  ];
  return urgentSignals.some((kw) => combined.includes(kw));
}

interface CityMatcher {
  cityId: string;
  cityName: string;
  stateId: string | null;
  regex: RegExp;
  len: number;
}

let cachedCityMatchers: CityMatcher[] | null = null;

function getCityMatchers(): CityMatcher[] {
  if (cachedCityMatchers && cachedCityMatchers.length > 0) {
    return cachedCityMatchers;
  }
  const cityRows = db
    .prepare('SELECT id, name, slug, state_id FROM cities')
    .all() as Array<{ id: string; name: string; slug: string; state_id: string | null }>;
  if (cityRows.length === 0) return [];

  const aliasMap: Record<string, string[]> = {
    bengaluru: ['bengaluru', 'bangalore'],
    mumbai: ['mumbai', 'bombay'],
    kolkata: ['kolkata', 'calcutta'],
    chennai: ['chennai', 'madras'],
    delhi: ['new delhi', 'delhi'],
    prayagraj: ['prayagraj', 'allahabad'],
    gurgaon: ['gurgaon', 'gurugram'],
    mysore: ['mysore', 'mysuru'],
    mangalore: ['mangalore', 'mangaluru'],
    belgaum: ['belgaum', 'belagavi'],
    tiruchirappalli: ['tiruchirappalli', 'trichy'],
    'chhatrapati-sambhajinagar': ['chhatrapati sambhajinagar', 'sambhajinagar'],
  };

  const matchers: CityMatcher[] = [];
  for (const c of cityRows) {
    const clean = c.name.replace(/\s*\(town\)/i, '').trim().toLowerCase();
    const terms = new Set<string>([clean, ...(aliasMap[c.slug] || [])]);
    for (const term of terms) {
      if (term.length < 3) continue;
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      matchers.push({
        cityId: c.id,
        cityName: c.name,
        stateId: c.state_id,
        regex: new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i'),
        len: term.length,
      });
    }
  }
  matchers.sort((a, b) => b.len - a.len);
  cachedCityMatchers = matchers;
  return matchers;
}

export function matchCityForText(
  text: string,
  preferredStateId?: string | null,
): { cityId: string; cityName: string; stateId: string | null } | null {
  const matchers = getCityMatchers();
  let fallback: CityMatcher | null = null;
  for (const m of matchers) {
    if (m.regex.test(text)) {
      if (!preferredStateId || m.stateId === preferredStateId) {
        return { cityId: m.cityId, cityName: m.cityName, stateId: m.stateId };
      }
      if (!fallback) fallback = m;
    }
  }
  return fallback ? { cityId: fallback.cityId, cityName: fallback.cityName, stateId: fallback.stateId } : null;
}

export function autoClassify(
  text: string,
  fallbackCategoryId: string | null,
): { categoryId: string; stateId: string | null; cityId: string | null } {
  const lower = text.toLowerCase();

  const states = db.prepare('SELECT id, name FROM states').all() as Array<{ id: string; name: string }>;
  let matchedStateId: string | null = null;
  for (const st of states) {
    if (lower.includes(st.name.toLowerCase())) {
      matchedStateId = st.id;
      break;
    }
  }

  const cityMatch = matchCityForText(text, matchedStateId);
  const matchedCityId = cityMatch?.cityId || null;
  if (!matchedStateId && cityMatch?.stateId) {
    matchedStateId = cityMatch.stateId;
  }

  // Dedicated topic feeds (Business, Sports, Technology, Science, etc.) keep their assigned desk category
  if (fallbackCategoryId && fallbackCategoryId !== 'cat-national') {
    return { categoryId: fallbackCategoryId, stateId: matchedStateId, cityId: matchedCityId };
  }

  const rules: Array<[string, string[]]> = [
    ['cat-sports', ['cricket', 'ipl', 'bcci', 'hockey', 'football', 'badminton', 'tennis', 'olympic', 'match', 'क्रिकेट', 'खेल', 'मैच', 'हॉकी']],
    ['cat-business', ['rbi', 'sensex', 'nifty', 'market', 'bank', 'gdp', 'startup', 'economy', 'rupee', 'stock', 'बाजार', 'अर्थव्यवस्था', 'बैंक', 'व्यापार']],
    ['cat-technology', ['ai ', 'artificial intelligence', 'semiconductor', 'cyber', 'telecom', '5g', 'software', 'tech', 'तकनीक', 'डिजिटल', 'सॉफ्टवेयर']],
    ['cat-science', ['isro', 'space', 'satellite', 'climate', 'research', 'vaccine', 'विज्ञान', 'अंतरिक्ष', 'इसरो']],
    ['cat-education', ['exam', 'neet', 'jee', 'university', 'school', 'nep', 'cbse', 'scholarship', 'शिक्षा', 'परीक्षा', 'विश्वविद्यालय']],
    ['cat-entertainment', ['cinema', 'film', 'bollywood', 'music', 'festival', 'actor', 'सिनेमा', 'फिल्म', 'मनोरंजन']],
    ['cat-international', ['un ', 'usa', 'china', 'russia', 'europe', 'summit', 'diplomacy', 'global', 'विदेश', 'अंतर्राष्ट्रीय', 'शिखर सम्मेलन']],
    ['cat-state', ['chief minister', 'assembly', 'panchayat', 'municipal', 'मुख्यमंत्री', 'विधानसभा', 'राज्य']],
  ];

  for (const [catId, keywords] of rules) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return { categoryId: catId, stateId: matchedStateId, cityId: matchedCityId };
    }
  }

  if (matchedStateId || matchedCityId) {
    return { categoryId: fallbackCategoryId || 'cat-state', stateId: matchedStateId, cityId: matchedCityId };
  }
  return { categoryId: fallbackCategoryId || 'cat-national', stateId: null, cityId: null };
}

interface ParsedFeedItem {
  title: string;
  link: string;
  summary: string;
  fullContent: string;
  imageUrl: string;
  imageRights: string;
  publishedAt: string;
  sourceName: string;
}

export async function fetchAndParseFeed(feedUrl: string, defaultSourceName: string): Promise<ParsedFeedItem[]> {
  const validated = validateExternalFeedUrl(feedUrl);
  const res = await fetch(validated.toString(), {
    headers: {
      'User-Agent': 'MaheepNewsPortal/1.0 (+https://maheepnews.in)',
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    throw new Error(`Feed returned HTTP ${res.status}`);
  }
  const xml = await res.text();
  const parsed = parser.parse(xml);

  const rssItems = parsed?.rss?.channel?.item;
  const atomItems = parsed?.feed?.entry;
  const rawList = rssItems || atomItems || [];
  const list = Array.isArray(rawList) ? rawList : [rawList];

  const results: ParsedFeedItem[] = [];
  for (const item of list.slice(0, 20)) {
    if (!item || typeof item !== 'object') continue;
    const rawTitle = typeof item.title === 'object' ? item.title['#text'] : item.title;
    const title = stripHtml(String(rawTitle || ''));
    let link = '';
    if (typeof item.link === 'string') {
      link = item.link;
    } else if (Array.isArray(item.link)) {
      const alt = item.link.find((l: Record<string, string>) => l['@_rel'] === 'alternate') || item.link[0];
      link = alt?.['@_href'] || '';
    } else if (item.link && typeof item.link === 'object') {
      link = item.link['@_href'] || item.link['#text'] || '';
    }
    const rawDesc =
      (typeof item.description === 'object' ? item.description['#text'] : item.description) ||
      (typeof item.summary === 'object' ? item.summary['#text'] : item.summary) ||
      title;
    const rawEncoded =
      (typeof item['content:encoded'] === 'object' ? item['content:encoded']['#text'] : item['content:encoded']) ||
      (typeof item.content === 'object' ? item.content['#text'] : item.content) ||
      (typeof item['media:description'] === 'object'
        ? item['media:description']['#text']
        : item['media:description']) ||
      '';
    const summary = stripHtml(String(rawDesc || '')).slice(0, 300);
    const fullBodyCandidate = stripHtmlPreserveParagraphs(String(rawEncoded || rawDesc || '')).slice(0, 6000);
    const fullContent = fullBodyCandidate.length > summary.length ? fullBodyCandidate : summary;

    const rawDate = item.pubDate || item.published || item.updated || item['dc:date'];
    let publishedAt = new Date().toISOString();
    if (rawDate) {
      const d = new Date(String(rawDate));
      if (!Number.isNaN(d.getTime())) {
        publishedAt = d.toISOString();
      }
    }

    const itemSource =
      typeof item.source === 'object' ? item.source['#text'] || defaultSourceName : item.source || defaultSourceName;
    const cleanSourceName = String(itemSource).trim() || defaultSourceName;
    const { imageUrl, imageRights } = extractRssItemMedia(
      item as Record<string, unknown>,
      `${String(rawEncoded || '')}\n${String(rawDesc || '')}`,
      cleanSourceName,
    );

    if (title && link) {
      results.push({
        title,
        link: normalizeArticleUrl(link),
        summary: summary || title,
        fullContent: fullContent || summary || title,
        imageUrl,
        imageRights,
        publishedAt,
        sourceName: cleanSourceName,
      });
    }
  }
  return results;
}

export async function runSingleRssSource(sourceId: string) {
  const source = db.prepare('SELECT * FROM rss_sources WHERE id = ?').get(sourceId) as
    | {
        id: string;
        name: string;
        feed_url: string;
        language: 'en' | 'hi';
        category_id: string | null;
        enabled: number;
      }
    | undefined;

  if (!source) {
    throw new Error('RSS source not found.');
  }

  const mode = getSetting('publishing_mode', 'auto_publish');
  const recentTitles = (
    db.prepare('SELECT title FROM articles ORDER BY created_at DESC LIMIT 80').all() as Array<{ title: string }>
  ).map((r) => r.title);

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let errorMsg = '';

  try {
    const items = await fetchAndParseFeed(source.feed_url, source.name);

    for (const item of items) {
      try {
        if (!item.title || item.title.length < 6 || !item.summary) {
          failed++;
          continue;
        }

        const existingUrl = db
          .prepare('SELECT id, image_url FROM articles WHERE source_url = ?')
          .get(item.link) as { id: string; image_url: string } | undefined;

        if (existingUrl) {
          if (!existingUrl.image_url && item.imageUrl) {
            db.prepare('UPDATE articles SET image_url = ?, image_rights = COALESCE(NULLIF(image_rights, \'\'), ?) WHERE id = ?').run(
              item.imageUrl,
              item.imageRights,
              existingUrl.id,
            );
          }
          skipped++;
          continue;
        }

        const isSimilarTitle = recentTitles.some((t) => titleSimilarity(t, item.title) >= 0.72);
        if (isSimilarTitle) {
          skipped++;
          continue;
        }

        const { categoryId, stateId, cityId } = autoClassify(`${item.title} ${item.summary}`, source.category_id);
        const isBreakingCandidate = detectBreakingCandidate(item.title, item.summary) ? 1 : 0;

        let resolvedImg = item.imageUrl;
        let resolvedRights = item.imageRights;
        if (!resolvedImg && !item.link.includes('news.google.com')) {
          const og = await fetchPublisherOgImage(item.link, item.sourceName);
          resolvedImg = og.imageUrl;
          resolvedRights = og.imageRights;
        }

        let finalStatus: 'pending' | 'published' = mode === 'manual_approval' ? 'pending' : 'published';
        let aiAssisted = 0;
        let aiAuditJson = '{}';

        if (mode === 'auto_publish_ai' && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
          try {
            const check = await runEditorialAiAssist({
              action: 'check_quality',
              actorEmail: 'rss:auto_publish_ai',
              title: item.title,
              summary: item.summary,
              sourceName: item.sourceName,
              sourceUrl: item.link,
              language: source.language,
              existingTitles: recentTitles.slice(0, 15),
            });
            aiAssisted = 1;
            aiAuditJson = JSON.stringify({ ...check, checkedAt: new Date().toISOString() });
            if (check && check.approved === false) {
              finalStatus = 'pending';
            }
          } catch {
            // AI failure never blocks RSS ingestion; hold for review safely
            finalStatus = 'pending';
          }
        }

        const articleId = `art-${crypto.randomUUID().slice(0, 10)}`;
        const contentBody =
          item.fullContent.length > item.summary.length + 40
            ? `${item.fullContent}\n\nSource Dispatch: ${item.sourceName}. Read the original publisher dispatch via the attribution link below.`
            : `${item.summary}\n\nSource Dispatch: ${item.sourceName}. Read the complete original report via the publisher attribution link below.`;

        db.prepare(`
          INSERT INTO articles (
            id, title, slug, summary, content, image_url, image_rights, source_name, source_url,
            author, language, category_id, state_id, city_id, status, featured, breaking,
            breaking_candidate, ai_assisted, ai_audit_json, published_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
        `).run(
          articleId,
          item.title,
          createSlug(item.title),
          item.summary,
          contentBody,
          resolvedImg,
          resolvedRights,
          item.sourceName,
          item.link,
          item.sourceName,
          source.language,
          categoryId,
          stateId,
          cityId,
          finalStatus,
          isBreakingCandidate,
          aiAssisted,
          aiAuditJson,
          item.publishedAt,
        );

        recentTitles.unshift(item.title);
        imported++;
      } catch {
        failed++;
      }
    }

    db.prepare(`
      UPDATE rss_sources
      SET last_fetched_at = datetime('now'), last_error = '', imported_count = imported_count + ?
      WHERE id = ?
    `).run(imported, source.id);
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : 'Feed fetch failed';
    failed++;
    db.prepare("UPDATE rss_sources SET last_fetched_at = datetime('now'), last_error = ? WHERE id = ?").run(
      errorMsg,
      source.id,
    );
  }

  const logStatus = errorMsg ? 'failed' : failed > 0 && imported > 0 ? 'partial' : 'success';
  db.prepare(`
    INSERT INTO rss_import_logs (id, source_id, source_name, status, imported, skipped, failed, message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `log-${crypto.randomUUID().slice(0, 8)}`,
    source.id,
    source.name,
    logStatus,
    imported,
    skipped,
    failed,
    errorMsg || `Imported ${imported}, skipped ${skipped} duplicates`,
  );

  if (imported > 0) {
    demoteSeedArticlesIfLiveNewsExists();
    syncDailyEditionsForRecentArticles();
  }

  return { sourceId: source.id, name: source.name, status: logStatus, imported, skipped, failed, error: errorMsg };
}

export function demoteSeedArticlesIfLiveNewsExists(): void {
  const liveCount = (
    db.prepare("SELECT COUNT(*) as c FROM articles WHERE status = 'published' AND source_url != ''").get() as {
      c: number;
    }
  ).c;
  if (liveCount >= 6) {
    db.prepare("UPDATE articles SET featured = 0, breaking = 0 WHERE source_url = '' AND length(id) <= 6 AND id LIKE 'art-%'").run();
  }
}

export async function retryFailedRssSources() {
  const failedSources = db
    .prepare("SELECT id FROM rss_sources WHERE enabled = 1 AND last_error != ''")
    .all() as Array<{ id: string }>;
  const results = [];
  for (const s of failedSources) {
    results.push(await runSingleRssSource(s.id));
  }
  demoteSeedArticlesIfLiveNewsExists();
  syncDailyEditionsForRecentArticles();
  return results;
}

export function syncDailyEditionsForRecentArticles(): void {
  const activeDates = db
    .prepare(`
      SELECT DISTINCT date(datetime(published_at, '+5 hours', '+30 minutes')) as ist_date
      FROM articles
      WHERE status = 'published' AND published_at IS NOT NULL
      ORDER BY ist_date DESC
      LIMIT 10
    `)
    .all() as Array<{ ist_date: string }>;

  const todayIst = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const dateSet = new Set(activeDates.map((r) => r.ist_date).filter(Boolean));
  dateSet.add(todayIst);

  for (const dateStr of dateSet) {
    try {
      generateEditionForDate(dateStr);
    } catch {
      // Skip dates without published stories
    }
  }
}

export async function runAllEnabledRssSources() {
  const sources = db.prepare('SELECT id FROM rss_sources WHERE enabled = 1').all() as Array<{ id: string }>;
  const results = [];
  for (const s of sources) {
    const res = await runSingleRssSource(s.id);
    results.push(res);
  }
  demoteSeedArticlesIfLiveNewsExists();
  syncDailyEditionsForRecentArticles();
  const nowIso = new Date().toISOString();
  const intervalMin = Math.max(15, Number(getSetting('rss_interval_minutes', '30')) || 30);
  const nextIso = new Date(Date.now() + intervalMin * 60_000).toISOString();
  setSetting('rss_last_run_at', nowIso);
  setSetting('rss_next_run_at', nextIso);
  return results;
}

const cityWireCooldown = new Map<string, number>();
const CITY_WIRE_COOLDOWN_MS = 15 * 60_000;

export async function fetchLiveCityWire(
  city: { id: string; name: string; slug: string; state_id: string | null; state_name: string },
  force = false,
): Promise<{ fetched: number; inserted: number; cached?: boolean; error?: string }> {
  const lastRun = cityWireCooldown.get(city.id) || 0;
  const now = Date.now();
  if (!force && now - lastRun < CITY_WIRE_COOLDOWN_MS) {
    return { fetched: 0, inserted: 0, cached: true };
  }
  if (force && now - lastRun < 8_000) {
    return { fetched: 0, inserted: 0, cached: true };
  }
  cityWireCooldown.set(city.id, now);

  const cleanName = city.name.replace(/\s*\(town\)/i, '').trim();
  const primaryQuery = `"${cleanName}" ${city.state_name} news`;
  const primaryUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(primaryQuery)}&hl=en-IN&gl=IN&ceid=IN:en`;

  try {
    let items = await fetchAndParseFeed(primaryUrl, `${cleanName} Local Wire`);
    if (items.length === 0) {
      const fallbackUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`${cleanName} India news`)}&hl=en-IN&gl=IN&ceid=IN:en`;
      items = await fetchAndParseFeed(fallbackUrl, `${cleanName} Local Wire`);
    }

    const recentTitles = (
      db.prepare('SELECT title FROM articles ORDER BY created_at DESC LIMIT 120').all() as Array<{ title: string }>
    ).map((r) => r.title);

    const insertStmt = db.prepare(`
      INSERT INTO articles (
        id, title, slug, summary, content, image_url, image_rights, source_name, source_url,
        author, language, category_id, state_id, city_id, subtopic, status, featured, breaking,
        breaking_candidate, ai_assisted, ai_audit_json, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en', 'cat-state', ?, ?, ?, 'published', 0, 0, 0, 0, '{}', ?)
    `);

    let cityPhotoFallback: { imageUrl: string; imageRights: string } | null | undefined;

    let inserted = 0;
    for (const item of items.slice(0, 10)) {
      if (!item.title || item.title.length < 8) continue;

      const existingUrl = db
        .prepare('SELECT id, city_id, image_url FROM articles WHERE source_url = ?')
        .get(item.link) as { id: string; city_id: string | null; image_url: string } | undefined;

      if (existingUrl) {
        if (!existingUrl.city_id) {
          db.prepare('UPDATE articles SET city_id = ?, state_id = COALESCE(state_id, ?) WHERE id = ?').run(
            city.id,
            city.state_id,
            existingUrl.id,
          );
        }
        continue;
      }

      if (recentTitles.some((t) => titleSimilarity(t, item.title) >= 0.72)) {
        continue;
      }

      let resolvedImg = item.imageUrl;
      let resolvedRights = item.imageRights;
      if (!resolvedImg && !item.link.includes('news.google.com')) {
        const og = await fetchPublisherOgImage(item.link, item.sourceName);
        resolvedImg = og.imageUrl;
        resolvedRights = og.imageRights;
      }
      if (!resolvedImg) {
        if (cityPhotoFallback === undefined) {
          cityPhotoFallback =
            (await resolveRealCommonsPhoto(`${cleanName} ${city.state_name} India`, cleanName)) ||
            (await resolveRealCommonsPhoto(`${city.state_name} India landmark`, city.state_name));
        }
        if (cityPhotoFallback) {
          resolvedImg = cityPhotoFallback.imageUrl;
          resolvedRights = cityPhotoFallback.imageRights;
        }
      }

      const articleId = `art-${crypto.randomUUID().slice(0, 10)}`;
      const contentBody =
        item.fullContent.length > item.summary.length + 30
          ? `${item.fullContent}\n\nOur Pride City Dispatch (${cleanName}, ${city.state_name}) · Source: ${item.sourceName}.`
          : `${item.summary}\n\nOur Pride City Dispatch (${cleanName}, ${city.state_name}) · Source: ${item.sourceName}. Read the full report via the publisher attribution link below.`;

      insertStmt.run(
        articleId,
        item.title,
        createSlug(`${cleanName}-${item.title}`),
        item.summary,
        contentBody,
        resolvedImg,
        resolvedRights,
        item.sourceName,
        item.link,
        item.sourceName,
        city.state_id,
        city.id,
        `Our Pride · ${cleanName}`,
        item.publishedAt,
      );
      recentTitles.unshift(item.title);
      inserted++;
    }

    return { fetched: items.length, inserted };
  } catch (err) {
    return {
      fetched: 0,
      inserted: 0,
      error: err instanceof Error ? err.message : 'Unable to reach city RSS wire',
    };
  }
}

export async function backfillArticleRealPhotos(): Promise<{ updated: number; skipped: number }> {
  const rows = db
    .prepare(`
      SELECT a.id, a.title, a.image_url, a.source_url, a.source_name, a.subtopic,
             c.slug as category_slug, c.name as category_name,
             s.name as state_name, ct.name as city_name
      FROM articles a
      LEFT JOIN categories c ON c.id = a.category_id
      LEFT JOIN states s ON s.id = a.state_id
      LEFT JOIN cities ct ON ct.id = a.city_id
      WHERE a.status = 'published'
        AND (
          TRIM(COALESCE(a.image_url, '')) = ''
          OR a.image_url LIKE '/src/assets/images/%'
          OR a.image_url LIKE '%/theme/images/og-image%'
          OR a.image_url LIKE '%og-image.png%'
        )
      ORDER BY a.published_at DESC
      LIMIT 120
    `)
    .all() as Array<{
    id: string;
    title: string;
    image_url: string;
    source_url: string;
    source_name: string;
    subtopic: string;
    category_slug: string | null;
    category_name: string | null;
    state_name: string | null;
    city_name: string | null;
  }>;

  const updateStmt = db.prepare('UPDATE articles SET image_url = ?, image_rights = ? WHERE id = ?');
  let updated = 0;
  let skipped = 0;

  const categoryFallbackQueries: Record<string, [string, string]> = {
    national: ['India Gate New Delhi', 'india gate'],
    international: ['United Nations Secretariat Building New York', 'united nations'],
    business: ['Reserve Bank of India Mumbai', 'mumbai'],
    sports: ['Wankhede Stadium Mumbai', 'wankhede'],
    technology: ['Electronic City Bangalore', 'bangalore'],
    science: ['PSLV Satish Dhawan Space Centre', 'pslv'],
    education: ['India Gate New Delhi Sansad Bhavan', 'delhi'],
    entertainment: ['Gateway of India Mumbai', 'mumbai'],
    state: ['Vidhana Soudha Bangalore', 'vidhana'],
  };

  for (const row of rows) {
    let picked: { imageUrl: string; imageRights: string } | null = null;

    if (row.source_url && !row.source_url.includes('news.google.com')) {
      const og = await fetchPublisherOgImage(row.source_url, row.source_name || 'Publisher');
      if (og.imageUrl) picked = og;
    }

    if (!picked && row.city_name) {
      const cleanCity = row.city_name.replace(/\s*\(town\)/i, '').trim();
      picked = await resolveRealCommonsPhoto(`${cleanCity} ${row.state_name || ''} India`, cleanCity);
    }

    if (!picked && row.state_name) {
      picked = await resolveRealCommonsPhoto(`${row.state_name} India architecture city`, row.state_name);
    }

    if (!picked) {
      const titleLower = row.title.toLowerCase();
      if (titleLower.includes('parliament') || titleLower.includes('संसद')) {
        picked = await resolveRealCommonsPhoto('New Parliament Building New Delhi Sansad Bhavan', 'parliament');
      } else if (titleLower.includes('supreme court')) {
        picked = await resolveRealCommonsPhoto('Supreme Court of India New Delhi', 'supreme');
      } else if (titleLower.includes('isro')) {
        picked = await resolveRealCommonsPhoto('PSLV Satish Dhawan Space Centre', 'pslv');
      } else if (titleLower.includes('rbi') || titleLower.includes('mumbai')) {
        picked = await resolveRealCommonsPhoto('Reserve Bank of India Mumbai', 'mumbai');
      } else if (titleLower.includes('solar') || titleLower.includes('सौर')) {
        picked = await resolveRealCommonsPhoto('Solar power plant India Rajasthan Gujarat', 'solar');
      } else if (titleLower.includes('defence') || titleLower.includes('radar')) {
        picked = await resolveRealCommonsPhoto('Indian Air Force Republic Day New Delhi aircraft', 'republic');
      } else if (titleLower.includes('ladakh') || titleLower.includes('लद्दाख')) {
        picked = await resolveRealCommonsPhoto('Ladakh highway mountains India', 'ladakh');
      } else if (titleLower.includes('port') || titleLower.includes('odisha') || titleLower.includes('west bengal')) {
        picked = await resolveRealCommonsPhoto('Port of Kolkata ship India', 'kolkata');
      } else {
        const [q, kw] = categoryFallbackQueries[row.category_slug || 'national'] || categoryFallbackQueries.national;
        picked = (await resolveRealCommonsPhoto(q, kw)) || (await resolveRealCommonsPhoto('Sansad Bhavan New Delhi', 'sansad'));
      }
    }

    if (picked?.imageUrl) {
      updateStmt.run(picked.imageUrl, picked.imageRights, row.id);
      updated++;
    } else {
      skipped++;
    }
  }

  // Also upgrade any broken or placeholder guide images in content_guides
  const guideRows = db
    .prepare("SELECT id, title, category FROM content_guides WHERE TRIM(COALESCE(image_url, '')) = '' OR image_url LIKE '/src/assets/images/%'")
    .all() as Array<{ id: string; title: string; category: string }>;
  const updateGuideStmt = db.prepare('UPDATE content_guides SET image_url = ? WHERE id = ?');
  for (const g of guideRows) {
    const query =
      g.id.includes('upsc')
        ? 'India Gate New Delhi'
        : g.id.includes('cyber')
        ? 'Reserve Bank of India Mumbai'
        : g.id.includes('video')
        ? 'Doordarshan Bhawan New Delhi India'
        : 'Sansad Bhavan New Delhi Parliament India';
    const picked = (await resolveRealCommonsPhoto(query)) || (await resolveRealCommonsPhoto('Sansad Bhavan New Delhi', 'sansad'));
    if (picked?.imageUrl) {
      updateGuideStmt.run(picked.imageUrl, g.id);
    }
  }

  if (updated > 0 || guideRows.length > 0) {
    syncDailyEditionsForRecentArticles();
  }
  return { updated, skipped };
}
