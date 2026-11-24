import crypto from 'node:crypto';
import net from 'node:net';
import { XMLParser } from 'fast-xml-parser';
import { db, getSetting, setSetting } from './db.ts';
import { runEditorialAiAssist } from './gemini.ts';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
});

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

export function autoClassify(text: string, fallbackCategoryId: string | null): { categoryId: string; stateId: string | null } {
  const lower = text.toLowerCase();

  // Check state/UT match first
  const states = db.prepare('SELECT id, name FROM states').all() as Array<{ id: string; name: string }>;
  let matchedStateId: string | null = null;
  for (const st of states) {
    if (lower.includes(st.name.toLowerCase())) {
      matchedStateId = st.id;
      break;
    }
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
      return { categoryId: catId, stateId: matchedStateId };
    }
  }

  if (matchedStateId) {
    return { categoryId: fallbackCategoryId || 'cat-state', stateId: matchedStateId };
  }
  return { categoryId: fallbackCategoryId || 'cat-national', stateId: null };
}

interface ParsedFeedItem {
  title: string;
  link: string;
  summary: string;
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
    const summary = stripHtml(String(rawDesc || '')).slice(0, 300);

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

    if (title && link) {
      results.push({
        title,
        link: normalizeArticleUrl(link),
        summary: summary || title,
        publishedAt,
        sourceName: String(itemSource).trim() || defaultSourceName,
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

  const mode = getSetting('publishing_mode', 'manual_approval');
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
        const existingUrl = db
          .prepare('SELECT id FROM articles WHERE source_url = ?')
          .get(item.link) as { id: string } | undefined;

        if (existingUrl) {
          skipped++;
          continue;
        }

        const isSimilarTitle = recentTitles.some((t) => titleSimilarity(t, item.title) >= 0.72);
        if (isSimilarTitle) {
          skipped++;
          continue;
        }

        const { categoryId, stateId } = autoClassify(`${item.title} ${item.summary}`, source.category_id);

        let finalStatus: 'pending' | 'published' = mode === 'manual_approval' ? 'pending' : 'published';
        let aiAssisted = 0;

        if (mode === 'auto_publish_ai' && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
          try {
            const check = await runEditorialAiAssist({
              action: 'check_quality',
              title: item.title,
              summary: item.summary,
              language: source.language,
              existingTitles: recentTitles.slice(0, 15),
            });
            aiAssisted = 1;
            if (check && check.approved === false) {
              finalStatus = 'pending';
            }
          } catch {
            // AI failure never blocks RSS ingestion; hold for review safely
            finalStatus = 'pending';
          }
        }

        const articleId = `art-${crypto.randomUUID().slice(0, 10)}`;
        const contentBody = `${item.summary}\n\nSource Dispatch: ${item.sourceName}. Read the complete original report via the publisher attribution link below.`;

        db.prepare(`
          INSERT INTO articles (
            id, title, slug, summary, content, image_url, source_name, source_url,
            author, language, category_id, state_id, status, featured, breaking,
            ai_assisted, published_at
          ) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
        `).run(
          articleId,
          item.title,
          createSlug(item.title),
          item.summary,
          contentBody,
          item.sourceName,
          item.link,
          item.sourceName,
          source.language,
          categoryId,
          stateId,
          finalStatus,
          aiAssisted,
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

  return { sourceId: source.id, name: source.name, status: logStatus, imported, skipped, failed, error: errorMsg };
}

export async function runAllEnabledRssSources() {
  const sources = db.prepare('SELECT id FROM rss_sources WHERE enabled = 1').all() as Array<{ id: string }>;
  const results = [];
  for (const s of sources) {
    // Isolate each feed so one failure never stops the remaining feeds
    const res = await runSingleRssSource(s.id);
    results.push(res);
  }
  const nowIso = new Date().toISOString();
  const intervalMin = Math.max(15, Number(getSetting('rss_interval_minutes', '60')) || 60);
  const nextIso = new Date(Date.now() + intervalMin * 60_000).toISOString();
  setSetting('rss_last_run_at', nowIso);
  setSetting('rss_next_run_at', nextIso);
  return results;
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

export function startRssScheduler(): void {
  if (schedulerTimer) clearInterval(schedulerTimer);
  const enabled = getSetting('rss_auto_enabled', 'true') === 'true';
  const intervalMin = Math.max(15, Number(getSetting('rss_interval_minutes', '60')) || 60);
  if (!enabled) return;

  const nextIso = new Date(Date.now() + intervalMin * 60_000).toISOString();
  setSetting('rss_next_run_at', nextIso);

  schedulerTimer = setInterval(() => {
    void runAllEnabledRssSources().catch((err) => {
      console.error('Scheduled RSS collection error:', err);
    });
  }, intervalMin * 60_000);
}
