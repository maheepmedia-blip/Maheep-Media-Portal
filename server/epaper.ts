import { buildEditionPagesPayload, db } from './db.ts';

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

export function generateEditionForDate(editionDate: string) {
  let published = db
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
      LIMIT 40
    `)
    .all(editionDate) as Array<Record<string, unknown>>;

  const todayIst = getTodayIndiaDate();
  if (editionDate === todayIst && published.length < 10) {
    const existingIds = new Set(published.map((a) => String(a.id)));
    const recentExtra = db
      .prepare(`
        SELECT a.id, a.title, a.slug, a.summary, a.content, a.image_url, a.image_rights, a.source_name, a.source_url, a.author, a.language, a.subtopic, a.views, a.published_at,
               a.state_id, a.city_id, c.name as category_name, c.slug as category_slug, s.name as state_name, ct.name as city_name, ct.slug as city_slug
        FROM articles a
        LEFT JOIN categories c ON c.id = a.category_id
        LEFT JOIN states s ON s.id = a.state_id
        LEFT JOIN cities ct ON ct.id = a.city_id
        WHERE a.status = 'published'
          AND date(datetime(a.published_at, '+5 hours', '+30 minutes')) <= date(?)
          AND datetime(a.published_at) >= datetime(?, '-2 days')
        ORDER BY CASE WHEN a.source_url != '' THEN 0 ELSE 1 END, a.published_at DESC
        LIMIT 40
      `)
      .all(todayIst, `${todayIst}T23:59:59+05:30`) as Array<Record<string, unknown>>;
    for (const row of recentExtra) {
      if (!existingIds.has(String(row.id)) && published.length < 40) {
        published.push(row);
        existingIds.add(String(row.id));
      }
    }
  }

  if (published.length === 0) {
    throw new Error(
      `No published articles found for ${editionDate} (IST). Publish or import articles dated ${editionDate} before generating this edition.`,
    );
  }

  const id = `ed-${editionDate}`;
  const pages = buildEditionPagesPayload(editionDate, published);
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

  return `<!doctype html>
<html lang="en">
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
