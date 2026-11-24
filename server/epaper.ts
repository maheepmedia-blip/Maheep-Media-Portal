import { buildEditionPagesPayload, db } from './db.ts';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateEditionForDate(editionDate: string) {
  const published = db
    .prepare(`
      SELECT a.id, a.title, a.slug, a.summary, a.content, a.image_url, a.source_name, a.author, a.language, a.published_at,
             c.name as category_name, c.slug as category_slug, s.name as state_name
      FROM articles a
      LEFT JOIN categories c ON c.id = a.category_id
      LEFT JOIN states s ON s.id = a.state_id
      WHERE a.status = 'published'
      ORDER BY a.featured DESC, a.breaking DESC, a.published_at DESC
      LIMIT 30
    `)
    .all() as Array<Record<string, unknown>>;

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

interface EditionPageData {
  pageNumber: number;
  sectionTitle: string;
  subtitle: string;
  articles: Array<{
    title: string;
    summary: string;
    source_name: string;
    author: string;
    category_name: string;
    state_name?: string;
    image_url?: string;
    published_at?: string;
  }>;
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

  const pagesHtml = pages
    .map((page) => {
      const itemsHtml = page.articles
        .map(
          (art, idx) => `
          <article class="story ${idx === 0 && page.pageNumber === 1 ? 'lead-story' : ''}">
            <div class="meta">${escapeHtml(art.category_name || 'News')}${art.state_name ? ` · ${escapeHtml(art.state_name)}` : ''} · ${escapeHtml(art.source_name || 'Maheep Desk')}</div>
            <h3>${escapeHtml(art.title)}</h3>
            ${art.image_url && idx === 0 ? `<img src="${escapeHtml(art.image_url)}" alt="${escapeHtml(art.title)}" class="story-img" />` : ''}
            <p>${escapeHtml(art.summary)}</p>
            <div class="byline">By ${escapeHtml(art.author || 'Editorial Desk')}</div>
          </article>
        `,
        )
        .join('');

      return `
        <section class="a4-page">
          <header class="page-header">
            <div class="masthead-mini">
              <span class="brand">MAHEEP NEWS PORTAL</span>
              <span class="tagline">सच के साथ, जनता के विश्वास के साथ · News from India &amp; Beyond</span>
            </div>
            <div class="page-meta">
              <span>${escapeHtml(page.sectionTitle)}</span>
              <span>Date: ${escapeHtml(edition.edition_date)} · Page ${page.pageNumber} of ${pages.length}</span>
            </div>
          </header>
          <div class="columns">
            ${itemsHtml}
          </div>
          <footer class="page-footer">
            <span>Maheep News Portal · Digital Broadsheet Archive</span>
            <span>Page ${page.pageNumber}</span>
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
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700&family=Playfair+Display:wght@600;700&family=Plus+Jakarta+Sans:wght@400;600&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; background: #f3f4f6; color: #111827; font-family: 'Plus Jakarta Sans', 'Noto Sans Devanagari', sans-serif; }
    .toolbar { max-width: 210mm; margin: 0 auto 16px; display: flex; justify-content: space-between; align-items: center; background: #00451F; color: #fff; padding: 12px 16px; border-radius: 6px; }
    .toolbar button { background: #159B42; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; font-weight: 600; cursor: pointer; }
    .a4-page { width: 210mm; min-height: 297mm; margin: 0 auto 20px; background: #fff; padding: 14mm; border: 1px solid #d1d5db; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; }
    .a4-page:last-child { page-break-after: auto; }
    .page-header { border-bottom: 2px solid #00652E; padding-bottom: 8px; margin-bottom: 14px; }
    .masthead-mini { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; }
    .brand { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 700; color: #00652E; letter-spacing: 0.02em; }
    .tagline { font-size: 11px; color: #4b5563; }
    .page-meta { display: flex; justify-content: space-between; font-size: 11px; color: #374151; margin-top: 6px; padding-top: 6px; border-top: 1px solid #e5e7eb; font-weight: 600; }
    .columns { column-count: 2; column-gap: 18px; flex: 1; }
    .story { break-inside: avoid; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb; }
    .lead-story { column-span: all; border-bottom: 2px solid #00652E; padding-bottom: 14px; }
    .lead-story h3 { font-size: 22px; }
    .meta { font-size: 10px; color: #00652E; font-weight: 600; margin-bottom: 4px; }
    h3 { font-family: 'Playfair Display', 'Noto Sans Devanagari', serif; font-size: 15px; line-height: 1.3; margin: 0 0 6px; color: #111827; }
    p { font-size: 12px; line-height: 1.55; margin: 0 0 6px; color: #374151; }
    .byline { font-size: 10px; color: #6b7280; }
    .story-img { width: 100%; max-height: 180px; object-fit: cover; margin: 8px 0; border-radius: 2px; }
    .page-footer { border-top: 1px solid #d1d5db; padding-top: 8px; margin-top: 12px; display: flex; justify-content: space-between; font-size: 10px; color: #6b7280; }
    @media print {
      body { background: #fff; padding: 0; }
      .toolbar { display: none; }
      .a4-page { border: none; margin: 0; width: auto; min-height: auto; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span><strong>${escapeHtml(edition.title)}</strong> — A4 Printable Broadsheet</span>
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
  ${pagesHtml}
</body>
</html>`;
}
