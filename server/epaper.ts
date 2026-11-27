import {
  buildEditionPagesPayload,
  db,
  getSetting,
  localizeEditionPageHeaders,
  setSetting,
} from './db.ts';
import {
  applyCachedTranslationsSync,
  translateNewsItems,
  type TranslatableNewsItem,
} from './translator.ts';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getTodayIndiaDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatStoryIstTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return (
    new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d) + ' IST'
  );
}

const TARGET_EDITION_STORIES = 300;

function mapWireBeatToCategory(
  scopeType: string,
  scopeSlug: string,
  beat: string,
): { category_slug: string; category_name: string } {
  if (scopeType === 'city' || scopeType === 'state') {
    return { category_slug: 'state', category_name: 'Our Pride · States & Cities' };
  }
  if (scopeType === 'country' && scopeSlug !== 'india') {
    return { category_slug: 'international', category_name: 'WorldWire · International' };
  }
  if (beat === 'economy') return { category_slug: 'business', category_name: 'Business & Economy' };
  if (beat === 'culture') return { category_slug: 'sports', category_name: 'Sports & Culture' };
  if (beat === 'society') return { category_slug: 'science', category_name: 'Science, Tech & Education' };
  return { category_slug: 'national', category_name: 'National' };
}

export function generateEditionForDate(editionDate: string) {
  const published = db
    .prepare(`
      SELECT a.id, a.title, a.slug, a.summary, a.content, a.image_url, a.image_rights, a.source_name, a.source_url, a.author, a.language, a.subtopic, a.views, a.published_at,
             a.state_id, a.city_id, c.name as category_name, c.slug as category_slug, s.name as state_name, ct.name as city_name, ct.slug as city_slug
      FROM articles a
      LEFT JOIN categories c ON c.id = a.category_id
      LEFT JOIN states s ON s.id = a.state_id
      LEFT JOIN cities ct ON ct.id = a.city_id
      WHERE a.status = 'published'
        AND date(datetime(a.published_at, '+5 hours', '+30 minutes')) = date(?)
      ORDER BY CASE WHEN a.source_url != '' THEN 0 ELSE 1 END, a.published_at DESC, a.featured DESC, a.breaking DESC
      LIMIT 300
    `)
    .all(editionDate) as Array<Record<string, unknown>>;

  const seenIds = new Set<string>(published.map((a) => String(a.id || '')));
  const seenUrls = new Set<string>(
    published.map((a) => String(a.source_url || '').trim()).filter(Boolean),
  );
  const seenTitles = new Set<string>(
    published.map((a) => String(a.title || '').trim().toLowerCase()).filter(Boolean),
  );

  const pushUnique = (row: Record<string, unknown>) => {
    if (published.length >= TARGET_EDITION_STORIES) return false;
    const rid = String(row.id || '');
    const url = String(row.source_url || '').trim();
    const normTitle = String(row.title || '').trim().toLowerCase();
    if (!normTitle || seenIds.has(rid) || seenTitles.has(normTitle)) return false;
    if (url && seenUrls.has(url)) return false;
    seenIds.add(rid);
    seenTitles.add(normTitle);
    if (url) seenUrls.add(url);
    published.push(row);
    return true;
  };

  if (published.length < TARGET_EDITION_STORIES) {
    const olderArticles = db
      .prepare(`
        SELECT a.id, a.title, a.slug, a.summary, a.content, a.image_url, a.image_rights, a.source_name, a.source_url, a.author, a.language, a.subtopic, a.views, a.published_at,
               a.state_id, a.city_id, c.name as category_name, c.slug as category_slug, s.name as state_name, ct.name as city_name, ct.slug as city_slug
        FROM articles a
        LEFT JOIN categories c ON c.id = a.category_id
        LEFT JOIN states s ON s.id = a.state_id
        LEFT JOIN cities ct ON ct.id = a.city_id
        WHERE a.status = 'published'
        ORDER BY CASE WHEN date(datetime(a.published_at, '+5 hours', '+30 minutes')) <= date(?) THEN 0 ELSE 1 END,
                 CASE WHEN a.source_url != '' THEN 0 ELSE 1 END,
                 a.published_at DESC
        LIMIT 500
      `)
      .all(editionDate) as Array<Record<string, unknown>>;

    for (const row of olderArticles) {
      if (published.length >= TARGET_EDITION_STORIES) break;
      pushUnique(row);
    }
  }

  if (published.length < TARGET_EDITION_STORIES) {
    const wireRows = db
      .prepare(`
        SELECT id, scope_type, scope_slug, scope_label, beat, title, summary, detailed_body,
               image_url, image_rights, source_name, source_url, author, language, published_at
        FROM wire_dispatches
        WHERE language = 'en'
        ORDER BY CASE WHEN scope_slug = 'india' THEN 0 WHEN scope_type IN ('state', 'city') THEN 1 ELSE 2 END,
                 CASE WHEN date(datetime(published_at, '+5 hours', '+30 minutes')) <= date(?) THEN 0 ELSE 1 END,
                 published_at DESC
        LIMIT 1200
      `)
      .all(editionDate) as Array<Record<string, unknown>>;

    for (const w of wireRows) {
      if (published.length >= TARGET_EDITION_STORIES) break;
      const scopeType = String(w.scope_type || 'country');
      const scopeSlug = String(w.scope_slug || '');
      const beat = String(w.beat || 'top');
      const mapped = mapWireBeatToCategory(scopeType, scopeSlug, beat);
      pushUnique({
        id: String(w.id),
        title: String(w.title || ''),
        slug: '',
        summary: String(w.summary || w.title || ''),
        content: String(w.detailed_body || w.summary || w.title || ''),
        image_url: String(w.image_url || ''),
        image_rights: String(w.image_rights || ''),
        source_name: String(w.source_name || 'Maheep Wire'),
        source_url: String(w.source_url || ''),
        author: String(w.author || w.source_name || 'Wire Desk'),
        language: String(w.language || 'en'),
        subtopic: String(w.scope_label || ''),
        views: 0,
        published_at: String(w.published_at || `${editionDate}T08:00:00+05:30`),
        state_id: scopeType === 'state' ? scopeSlug : null,
        city_id: scopeType === 'city' ? scopeSlug : null,
        category_name: mapped.category_name,
        category_slug: mapped.category_slug,
        state_name: scopeType === 'state' ? String(w.scope_label || '').split('·')[0].trim() : undefined,
        city_name: scopeType === 'city' ? String(w.scope_label || '').split('·')[0].trim() : undefined,
        city_slug: scopeType === 'city' ? scopeSlug : undefined,
      });
    }
  }

  if (published.length === 0) {
    throw new Error(
      `No published articles found for ${editionDate} (IST). Publish or import articles dated ${editionDate} before generating this edition.`,
    );
  }

  const id = `ed-${editionDate}`;
  const pages = buildEditionPagesPayload(editionDate, published, 'all');
  const coverImage = String(
    published.find((a) => Boolean(a.image_url))?.image_url ||
      '/src/assets/images/hero_parliament_india_1795494842593.jpg',
  );
  const title = `Maheep Digital Broadsheet — ${editionDate}`;

  db.prepare(`
    INSERT INTO editions (id, edition_date, title, pdf_url, cover_image, page_count, article_count, status, content_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?)
    ON CONFLICT(edition_date) DO UPDATE SET
      title = excluded.title,
      pdf_url = excluded.pdf_url,
      cover_image = excluded.cover_image,
      page_count = excluded.page_count,
      article_count = excluded.article_count,
      content_json = excluded.content_json
  `).run(id, editionDate, title, `/api/editions/${id}/html`, coverImage, pages.length, published.length, JSON.stringify({ pages }));

  return db.prepare('SELECT * FROM editions WHERE edition_date = ?').get(editionDate);
}

export function ensureAllEditionsDetailed25Pages(): void {
  const alreadyDone = getSetting('edition_25pages_v1', '') === 'done';
  const underSized = db
    .prepare("SELECT COUNT(*) as c FROM editions WHERE status = 'published' AND page_count < 24")
    .get() as { c: number };

  if (alreadyDone && underSized.c === 0) return;

  const existingDates = db
    .prepare('SELECT edition_date FROM editions ORDER BY edition_date DESC')
    .all() as Array<{ edition_date: string }>;

  const dateSet = new Set<string>(existingDates.map((r) => r.edition_date));
  dateSet.add(getTodayIndiaDate());

  for (const dateStr of dateSet) {
    try {
      generateEditionForDate(dateStr);
    } catch {
      // Skip if date has zero publishable records
    }
  }

  setSetting('edition_25pages_v1', 'done');
}

export async function buildLocalizedEditionRow<
  T extends {
    id: string;
    edition_date: string;
    title: string;
    pdf_url: string;
    cover_image: string;
    page_count: number;
    article_count: number;
    status: string;
    content_json: string;
    created_at: string;
  },
>(
  edition: T,
  lang: 'all' | 'en' | 'hi',
  opts?: { activePage?: number; translateAll?: boolean; skipLive?: boolean },
): Promise<T> {
  if (lang === 'all') return edition;

  let pages: EditionPageData[] = [];
  try {
    const parsed = JSON.parse(edition.content_json || '{}') as { pages?: EditionPageData[] };
    pages = Array.isArray(parsed.pages) ? parsed.pages : [];
  } catch {
    return edition;
  }

  if (pages.length === 0) return edition;

  // Preserve the EXACT same stories, images, and page layout; only localize headings & stories in place
  let localizedPages = localizeEditionPageHeaders(pages, edition.edition_date, lang).map((p) => ({
    ...p,
    articles: applyCachedTranslationsSync(
      (p.articles || []) as unknown as TranslatableNewsItem[],
      lang,
    ) as unknown as EditionArticleData[],
  }));

  if (!opts?.skipLive) {
    if (opts?.translateAll) {
      // Translate up to first 4 pages live (plus any SQLite-cached pages across all 25 pages) for printable HTML
      const pagesToTranslate = Math.min(localizedPages.length, 4);
      for (let i = 0; i < pagesToTranslate; i++) {
        localizedPages[i] = {
          ...localizedPages[i],
          articles: (await translateNewsItems(
            localizedPages[i].articles as unknown as TranslatableNewsItem[],
            lang,
            { translateBody: false, maxLive: 15 },
          )) as unknown as EditionArticleData[],
        };
      }
    } else {
      const targetIdx = Math.min(
        Math.max(0, (opts?.activePage || 1) - 1),
        localizedPages.length - 1,
      );
      localizedPages[targetIdx] = {
        ...localizedPages[targetIdx],
        articles: (await translateNewsItems(
          localizedPages[targetIdx].articles as unknown as TranslatableNewsItem[],
          lang,
          { translateBody: false, maxLive: 15 },
        )) as unknown as EditionArticleData[],
      };
    }
  }

  const localizedTitle =
    lang === 'hi'
      ? `महीप दैनिक ई-पेपर (हिंदी संस्करण) — ${edition.edition_date}`
      : `Maheep Digital Broadsheet (English Edition) — ${edition.edition_date}`;

  return {
    ...edition,
    title: localizedTitle,
    page_count: localizedPages.length,
    content_json: JSON.stringify({ pages: localizedPages }),
  };
}

export async function translateSingleEditionPage(
  edition: {
    id: string;
    edition_date: string;
    content_json: string;
  },
  pageNumber: number,
  lang: 'all' | 'en' | 'hi',
): Promise<EditionPageData | null> {
  let pages: EditionPageData[] = [];
  try {
    const parsed = JSON.parse(edition.content_json || '{}') as { pages?: EditionPageData[] };
    pages = Array.isArray(parsed.pages) ? parsed.pages : [];
  } catch {
    return null;
  }
  if (pages.length === 0) return null;

  const localizedHeaders = localizeEditionPageHeaders(pages, edition.edition_date, lang);
  const idx = Math.min(Math.max(0, pageNumber - 1), localizedHeaders.length - 1);
  const targetPage = localizedHeaders[idx];
  if (!targetPage) return null;

  if (lang === 'all') return targetPage;

  const translatedArticles = (await translateNewsItems(
    (targetPage.articles || []) as unknown as TranslatableNewsItem[],
    lang,
    { translateBody: false, maxLive: 15 },
  )) as unknown as EditionArticleData[];

  return {
    ...targetPage,
    articles: translatedArticles,
  };
}

interface EditionArticleData {
  id?: string;
  title: string;
  slug?: string;
  summary: string;
  content?: string;
  source_name: string;
  source_url?: string;
  author: string;
  category_name: string;
  state_name?: string;
  city_name?: string;
  city_slug?: string;
  subtopic?: string;
  image_url?: string;
  image_rights?: string;
  published_at?: string;
}

interface EditionPageData {
  pageNumber: number;
  sectionTitle: string;
  subtitle: string;
  articles: EditionArticleData[];
}

interface ActiveAdRow {
  id: string;
  title: string;
  advertiser: string;
  placement: string;
  image_url: string;
  target_url: string;
  description: string;
  cta_text: string;
}

function getEditionActiveAds(): ActiveAdRow[] {
  const todayIst = getTodayIndiaDate();
  return db
    .prepare(`
      SELECT id, title, advertiser, placement, image_url, target_url, description, cta_text
      FROM ads
      WHERE active = 1
        AND (start_date = '' OR date(start_date) <= date(?))
        AND (end_date = '' OR date(end_date) >= date(?))
      ORDER BY CASE
        WHEN placement = 'epaper_banner' THEN 0
        WHEN placement = 'all_slots' THEN 1
        ELSE 2
      END, created_at DESC
      LIMIT 6
    `)
    .all(todayIst, todayIst) as ActiveAdRow[];
}

function splitDetailedParagraphs(summary: string, content?: string): { standfirst: string; bodyParagraphs: string[] } {
  const cleanSummary = (summary || '').trim();
  const cleanContent = (content || '').trim();
  if (!cleanContent || cleanContent === cleanSummary) {
    return {
      standfirst: '',
      bodyParagraphs: cleanSummary
        ? cleanSummary.split(/\n+/).map((p) => p.trim()).filter(Boolean)
        : [],
    };
  }
  const paragraphs = cleanContent
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const firstStartsSame =
    cleanSummary.length > 20 &&
    paragraphs.length > 0 &&
    paragraphs[0].toLowerCase().startsWith(cleanSummary.slice(0, 40).toLowerCase());

  return {
    standfirst: firstStartsSame ? '' : cleanSummary,
    bodyParagraphs: paragraphs,
  };
}

function renderAdBoxHtml(ad: ActiveAdRow): string {
  const inner = `
    <div class="epaper-ad-box">
      <div class="ad-kicker">
        <span>ADVERTISEMENT · विज्ञापन</span>
        ${ad.advertiser ? `<span>Sponsored by ${escapeHtml(ad.advertiser)}</span>` : ''}
      </div>
      <div class="ad-body">
        ${ad.image_url ? `<img src="${escapeHtml(ad.image_url)}" alt="${escapeHtml(ad.title)}" class="ad-img" />` : ''}
        <div class="ad-copy">
          <h4>${escapeHtml(ad.title)}</h4>
          ${ad.description ? `<p>${escapeHtml(ad.description)}</p>` : ''}
          ${ad.target_url ? `<span class="ad-cta">${escapeHtml(ad.cta_text || 'Learn More')} →</span>` : ''}
        </div>
      </div>
    </div>
  `;
  if (!ad.target_url) return inner;
  const isExternal = /^https?:\/\//i.test(ad.target_url);
  return `<a href="${escapeHtml(ad.target_url)}" ${isExternal ? 'target="_blank" rel="noopener noreferrer sponsored"' : ''} class="ad-link">${inner}</a>`;
}

export function renderEditionPrintableHtml(edition: {
  id: string;
  edition_date: string;
  title: string;
  content_json: string;
}): string {
  let pages: EditionPageData[] = [];
  try {
    const parsed = JSON.parse(edition.content_json || '{}');
    pages = Array.isArray(parsed.pages) ? parsed.pages : [];
  } catch {
    pages = [];
  }

  const activeAds = getEditionActiveAds();

  const pagesHtml = pages
    .map((page, pageIndex) => {
      const pageAd = activeAds.length > 0 ? activeAds[pageIndex % activeAds.length] : null;
      const itemsHtml = page.articles
        .map((art, idx) => {
          const { standfirst, bodyParagraphs } = splitDetailedParagraphs(art.summary, art.content);
          const timeLabel = formatStoryIstTime(art.published_at);
          const isLead = idx === 0 && page.pageNumber === 1;
          const showImg = Boolean(art.image_url) && (idx === 0 || idx === 1);
          const metaParts = [
            art.category_name || 'News',
            art.city_name || '',
            art.state_name || '',
            art.subtopic || '',
            art.source_name || 'Maheep Desk',
          ].filter(Boolean);

          return `
          <article class="story ${isLead ? 'lead-story' : ''}">
            <div class="meta">${escapeHtml(metaParts.join(' · '))}</div>
            <h3>${escapeHtml(art.title)}</h3>
            ${timeLabel ? `<div class="dateline">${escapeHtml(timeLabel)}</div>` : ''}
            ${
              showImg
                ? `<figure class="story-figure">
                    <img src="${escapeHtml(art.image_url!)}" alt="${escapeHtml(art.title)}" class="story-img" />
                    ${art.image_rights ? `<figcaption>${escapeHtml(art.image_rights)}</figcaption>` : ''}
                  </figure>`
                : ''
            }
            ${standfirst ? `<p class="standfirst">${escapeHtml(standfirst)}</p>` : ''}
            ${bodyParagraphs.map((para, pIdx) => `<p class="${isLead && pIdx === 0 ? 'lead-para' : ''}">${escapeHtml(para)}</p>`).join('')}
            <div class="byline">
              <span>By ${escapeHtml(art.author || 'Editorial Desk')}</span>
              ${art.source_url ? ` · <a href="${escapeHtml(art.source_url)}" target="_blank" rel="noopener noreferrer">Source Dispatch</a>` : ''}
            </div>
          </article>
        `;
        })
        .join('');

      return `
        <section class="a4-page">
          <header class="page-header">
            <div class="masthead-mini">
              <span class="brand">MAHEEP NEWS PORTAL</span>
              <span class="tagline">सच के साथ, जनता के विश्वास के साथ · Detailed Digital Broadsheet</span>
            </div>
            <div class="page-meta">
              <span>${escapeHtml(page.sectionTitle)} · ${page.articles.length} Detailed Reports</span>
              <span>Edition Date: ${escapeHtml(edition.edition_date)} · Page ${page.pageNumber} of ${pages.length}</span>
            </div>
          </header>
          ${pageAd && pageIndex === 0 ? `<div class="page-top-ad">${renderAdBoxHtml(pageAd)}</div>` : ''}
          <div class="columns">
            ${itemsHtml}
          </div>
          ${pageAd && pageIndex > 0 ? `<div class="page-bottom-ad">${renderAdBoxHtml(pageAd)}</div>` : ''}
          <footer class="page-footer">
            <span>Maheep News Portal · Verified Journalism &amp; Digital Broadsheet Archive</span>
            <span>Page ${page.pageNumber} of ${pages.length}</span>
          </footer>
        </section>
      `;
    })
    .join('');

  const isHindiHtml = /[\u0900-\u097F]/.test(edition.title);

  return `<!doctype html>
<html lang="${isHindiHtml ? 'hi' : 'en'}">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(edition.title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700&family=Playfair+Display:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; background: #f3f4f6; color: #111827; font-family: 'Plus Jakarta Sans', 'Noto Sans Devanagari', sans-serif; }
    .toolbar { max-width: 210mm; margin: 0 auto 16px; display: flex; justify-content: space-between; align-items: center; background: #00451F; color: #fff; padding: 12px 16px; border-radius: 6px; }
    .toolbar button { background: #159B42; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; font-weight: 600; cursor: pointer; }
    .a4-page { width: 210mm; min-height: 297mm; margin: 0 auto 20px; background: #fff; padding: 12mm; border: 1px solid #d1d5db; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; }
    .a4-page:last-child { page-break-after: auto; }
    .page-header { border-bottom: 2px solid #00652E; padding-bottom: 8px; margin-bottom: 12px; }
    .masthead-mini { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; }
    .brand { font-family: 'Playfair Display', serif; font-size: 23px; font-weight: 800; color: #00652E; letter-spacing: 0.02em; }
    .tagline { font-size: 11px; color: #4b5563; }
    .page-meta { display: flex; justify-content: space-between; font-size: 11px; color: #374151; margin-top: 6px; padding-top: 6px; border-top: 1px solid #e5e7eb; font-weight: 600; }
    .columns { column-count: 2; column-gap: 18px; column-rule: 1px solid #e5e7eb; flex: 1; }
    .story { break-inside: avoid; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb; }
    .lead-story { column-span: all; border-bottom: 2px solid #00652E; padding-bottom: 14px; margin-bottom: 14px; }
    .lead-story h3 { font-size: 22px; }
    .meta { font-size: 10px; color: #00652E; font-weight: 700; margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.03em; }
    .dateline { font-size: 10px; color: #6b7280; margin-bottom: 6px; }
    h3 { font-family: 'Playfair Display', 'Noto Sans Devanagari', serif; font-size: 15px; line-height: 1.28; margin: 0 0 4px; color: #111827; }
    .standfirst { font-size: 12px; font-weight: 600; color: #1f2937; margin: 0 0 6px; line-height: 1.48; }
    p { font-size: 11.5px; line-height: 1.56; margin: 0 0 6px; color: #374151; text-align: justify; }
    .lead-para::first-letter { float: left; font-family: 'Playfair Display', serif; font-size: 32px; line-height: 0.9; font-weight: 700; color: #00652E; padding-right: 6px; }
    .byline { font-size: 10px; color: #6b7280; margin-top: 4px; }
    .byline a { color: #00652E; font-weight: 600; text-decoration: none; }
    .story-figure { margin: 6px 0 8px; }
    .story-img { width: 100%; max-height: 175px; object-fit: cover; border-radius: 2px; display: block; }
    .story-figure figcaption { font-size: 9px; color: #6b7280; margin-top: 3px; font-style: italic; }
    .page-top-ad { margin-bottom: 12px; }
    .page-bottom-ad { margin-top: 12px; }
    .ad-link { text-decoration: none; color: inherit; display: block; }
    .epaper-ad-box { border: 1.5px solid #00652E; background: #EAF5E5; padding: 8px 12px; border-radius: 4px; }
    .ad-kicker { display: flex; justify-content: space-between; font-size: 9px; font-weight: 700; color: #00451F; letter-spacing: 0.04em; margin-bottom: 5px; border-bottom: 1px solid rgba(0,101,46,0.2); padding-bottom: 3px; }
    .ad-body { display: flex; gap: 10px; align-items: center; }
    .ad-img { width: 92px; height: 56px; object-fit: cover; border-radius: 2px; border: 1px solid rgba(0,0,0,0.12); flex-shrink: 0; }
    .ad-copy h4 { margin: 0 0 3px; font-family: 'Playfair Display', 'Noto Sans Devanagari', serif; font-size: 13.5px; color: #111827; }
    .ad-copy p { margin: 0 0 3px; font-size: 10.5px; line-height: 1.35; color: #374151; text-align: left; }
    .ad-cta { font-size: 10px; font-weight: 700; color: #00652E; }
    .page-footer { border-top: 1px solid #d1d5db; padding-top: 8px; margin-top: 12px; display: flex; justify-content: space-between; font-size: 10px; color: #6b7280; }
    @media print {
      body { background: #fff; padding: 0; }
      .toolbar { display: none; }
      .a4-page { border: none; margin: 0; width: auto; min-height: auto; page-break-after: always; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span><strong>${escapeHtml(edition.title)}</strong> — A4 Detailed Printable Broadsheet</span>
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
  ${pagesHtml}
</body>
</html>`;
}
