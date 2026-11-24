import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response } from 'express';
import { listAdminAuditLogs, recordAdminAudit } from './audit.ts';
import {
  type AuthenticatedRequest,
  hashPassword,
  isAdminSetupNeeded,
  isSessionSecretEphemeral,
  requireAdmin,
  requireSuperAdmin,
  signToken,
  verifyCronSecret,
  verifyPassword,
} from './auth.ts';
import {
  createVerifiedBackup,
  getStorageHealth,
  listBackups,
  resolveSafeBackupPath,
  restoreFromVerifiedBackup,
} from './backup.ts';
import { db, getSetting, setSetting, uploadsDir } from './db.ts';
import {
  checkRateLimit,
  isSmtpConfigured,
  retryFailedEmails,
  sendAdminContactNotification,
  sendNewsletterConfirmationEmail,
} from './email.ts';
import { generateEditionForDate, renderEditionPrintableHtml } from './epaper.ts';
import { type AiAssistAction, isGeminiConfigured, runEditorialAiAssist } from './gemini.ts';
import { ALL_JOB_NAMES, type JobName, listRecentCronRuns, runManagedJob } from './jobs.ts';
import { broadcastBreakingPush, ensureVapidConfigured, removePushSubscription, savePushSubscription } from './push.ts';
import {
  type ReaderAuthenticatedRequest,
  authenticateReaderAccount,
  registerReaderAccount,
  requireReader,
} from './readerAuth.ts';
import {
  createSlug,
  fetchAndParseFeed,
  runAllEnabledRssSources,
  runSingleRssSource,
  titleSimilarity,
  validateExternalFeedUrl,
} from './rss.ts';
import { getWeatherForecast } from './weather.ts';

function sanitizeSafeUrl(raw: unknown): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('/src/assets/') || s.startsWith('/uploads/')) return s;
  try {
    const u = new URL(s);
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.toString();
  } catch {
    return '';
  }
  return '';
}

function sanitizeAdTargetUrl(raw: unknown): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  try {
    const u = new URL(s);
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.toString();
  } catch {
    return '';
  }
  return '';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const VALID_AD_PLACEMENTS = ['header_banner', 'homepage_mid', 'sidebar', 'article_inline', 'epaper_banner'] as const;

function getTodayIndiaDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function resolvePublicBaseUrl(req: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && configured !== 'MY_APP_URL') {
    return configured.replace(/\/$/, '');
  }
  return `${req.protocol}://${req.get('host')}`;
}

const ARTICLE_SELECT = `
  SELECT a.*, c.name as category_name, c.slug as category_slug,
         s.name as state_name, s.slug as state_slug, s.type as state_type, s.code as state_code
  FROM articles a
  LEFT JOIN categories c ON c.id = a.category_id
  LEFT JOIN states s ON s.id = a.state_id
`;

export function registerApiRoutes(app: Express): void {
  // ---------------- PUBLIC HEALTH & SEO ----------------

  app.get('/api/health', (_req, res) => {
    const storage = getStorageHealth();
    const recentJobs = db
      .prepare(`
        SELECT job_name, status, started_at, finished_at, duration_ms
        FROM cron_job_runs
        ORDER BY started_at DESC
        LIMIT 8
      `)
      .all();

    const ok = storage.integrity === 'ok';
    res.status(ok ? 200 : 503).json({
      ok,
      portal: 'Maheep News Portal',
      timezone: 'Asia/Kolkata',
      storage: {
        dataDirConfigured: storage.dataDirConfigured,
        integrity: storage.integrity,
        dbSizeBytes: storage.dbSizeBytes,
        uploadFiles: storage.uploadFiles,
        backupFiles: storage.backupFiles,
      },
      services: {
        geminiConfigured: isGeminiConfigured(),
        smtpConfigured: isSmtpConfigured(),
        ephemeralSessionSecret: isSessionSecretEphemeral(),
      },
      recentJobs,
    });
  });

  app.get('/robots.txt', (req, res) => {
    const baseUrl = resolvePublicBaseUrl(req);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin',
        'Disallow: /api/',
        '',
        `Sitemap: ${baseUrl}/sitemap.xml`,
      ].join('\n'),
    );
  });

  app.get('/sitemap.xml', (req, res) => {
    const baseUrl = resolvePublicBaseUrl(req);
    const articles = db
      .prepare("SELECT slug, title, image_url, updated_at FROM articles WHERE status = 'published' ORDER BY published_at DESC LIMIT 500")
      .all() as Array<{ slug: string; title: string; image_url: string; updated_at: string }>;

    const staticRoutes = ['', '/national', '/states', '/business-sports', '/epaper', '/contact', '/search'];
    const urls = [
      ...staticRoutes.map(
        (r) =>
          `<url><loc>${baseUrl}${r}</loc><changefreq>hourly</changefreq><priority>${r === '' ? '1.0' : '0.8'}</priority></url>`,
      ),
      ...articles.map((a) => {
        const imgAbs = a.image_url?.startsWith('http')
          ? a.image_url
          : a.image_url
          ? `${baseUrl}${a.image_url}`
          : '';
        const imgTag = imgAbs
          ? `<image:image><image:loc>${escapeHtml(imgAbs)}</image:loc><image:title>${escapeHtml(a.title)}</image:title></image:image>`
          : '';
        return `<url><loc>${baseUrl}/news/${encodeURIComponent(a.slug)}</loc><lastmod>${new Date(a.updated_at).toISOString()}</lastmod>${imgTag}</url>`;
      }),
    ];

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join('\n')}\n</urlset>`,
    );
  });

  // ---------------- RENDER EXTERNAL CRON ENDPOINTS ----------------

  app.all('/api/cron/:jobName', async (req, res) => {
    if (!verifyCronSecret(req)) {
      res.status(401).json({ error: 'Unauthorized cron trigger.' });
      return;
    }
    const jobName = String(req.params.jobName || '').trim() as JobName;
    if (!ALL_JOB_NAMES.includes(jobName)) {
      res.status(404).json({ error: `Unknown job "${jobName}".` });
      return;
    }
    const result = await runManagedJob(jobName, {
      triggerSource: 'cron_http',
      force: req.query.force === 'true',
    });
    res.status(result.status === 'failed' ? 500 : 200).json({ ok: result.status !== 'failed', jobName, ...result });
  });

  // ---------------- PUBLIC NEWS, WEATHER, ADS & COMMENTS ----------------

  app.get('/api/weather', async (req, res) => {
    try {
      const city = req.query.city ? String(req.query.city).trim() : undefined;
      const lat = req.query.lat !== undefined ? Number(req.query.lat) : undefined;
      const lon = req.query.lon !== undefined ? Number(req.query.lon) : undefined;
      const weather = await getWeatherForecast({ city, lat, lon });
      res.setHeader('Cache-Control', 'no-store');
      res.json(weather);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to fetch weather forecast.',
      });
    }
  });

  app.get('/api/home', (req, res) => {
    const lang = req.query.lang === 'hi' || req.query.lang === 'en' ? req.query.lang : null;
    const langClause = lang ? ' AND a.language = ?' : '';
    const langParams = lang ? [lang] : [];

    const breaking = db
      .prepare(`${ARTICLE_SELECT} WHERE a.status = 'published' AND a.breaking = 1${langClause} ORDER BY a.published_at DESC LIMIT 10`)
      .all(...langParams);

    const featured = db
      .prepare(`${ARTICLE_SELECT} WHERE a.status = 'published' AND a.featured = 1${langClause} ORDER BY a.published_at DESC LIMIT 6`)
      .all(...langParams) as Array<{ id: string }>;

    const excludeFeaturedIds = featured.map((a) => a.id);
    const notFeaturedClause =
      excludeFeaturedIds.length > 0
        ? ` AND a.id NOT IN (${excludeFeaturedIds.map(() => '?').join(',')})`
        : '';

    const latest = db
      .prepare(`${ARTICLE_SELECT} WHERE a.status = 'published'${langClause}${notFeaturedClause} ORDER BY a.published_at DESC LIMIT 16`)
      .all(...langParams, ...excludeFeaturedIds) as Array<{ id: string }>;

    const trending = db
      .prepare(`${ARTICLE_SELECT} WHERE a.status = 'published'${langClause} ORDER BY a.views DESC, a.published_at DESC LIMIT 6`)
      .all(...langParams);

    const querySection = (whereExtra: string, limit = 4) =>
      db
        .prepare(`${ARTICLE_SELECT} WHERE a.status = 'published'${langClause}${notFeaturedClause} AND (${whereExtra}) ORDER BY a.published_at DESC LIMIT ?`)
        .all(...langParams, ...excludeFeaturedIds, limit);

    const sections = {
      national: querySection("c.slug IN ('national', 'international')", 4),
      state: querySection("c.slug = 'state' OR a.state_id IS NOT NULL", 4),
      business: querySection("c.slug = 'business'", 4),
      sports: querySection("c.slug = 'sports'", 4),
      technology: querySection("c.slug IN ('technology', 'science')", 4),
      education: querySection("c.slug IN ('education', 'entertainment')", 4),
    };

    const categories = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
    const states = db
      .prepare(`
        SELECT s.*, COUNT(a.id) as article_count
        FROM states s
        LEFT JOIN articles a ON a.state_id = s.id AND a.status = 'published'
        GROUP BY s.id
        ORDER BY s.type ASC, s.name ASC
      `)
      .all();

    const latestEdition = db
      .prepare("SELECT id, edition_date, title, pdf_url, cover_image, page_count, article_count, status FROM editions WHERE status = 'published' ORDER BY edition_date DESC LIMIT 1")
      .get();

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      breaking,
      featured,
      latest,
      trending,
      sections,
      categories,
      states,
      latestEdition,
      settings: {
        tagline_hi: getSetting('tagline_hi', 'सच के साथ, जनता के विश्वास के साथ'),
        tagline_en: getSetting('tagline_en', 'News from India & Beyond'),
      },
    });
  });

  app.get('/api/articles', (req, res) => {
    const q = String(req.query.q || '').trim();
    const category = String(req.query.category || '').trim();
    const state = String(req.query.state || '').trim();
    const language = String(req.query.language || '').trim();
    const date = String(req.query.date || '').trim();
    const subtopic = String(req.query.subtopic || '').trim();
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 24));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const conditions = ["a.status = 'published'"];
    const params: unknown[] = [];

    if (q) {
      conditions.push('(a.title LIKE ? OR a.summary LIKE ? OR a.content LIKE ?)');
      const pat = `%${q}%`;
      params.push(pat, pat, pat);
    }
    if (category && category !== 'all') {
      conditions.push('c.slug = ?');
      params.push(category);
    }
    if (state === 'any') {
      conditions.push("(a.state_id IS NOT NULL OR c.slug = 'state')");
    } else if (state && state !== 'all') {
      conditions.push('s.slug = ?');
      params.push(state);
    }
    if (language === 'en' || language === 'hi') {
      conditions.push('a.language = ?');
      params.push(language);
    }
    if (date) {
      conditions.push("date(datetime(a.published_at, '+5 hours', '+30 minutes')) = date(?)");
      params.push(date);
    }
    if (subtopic && subtopic !== 'all') {
      conditions.push('a.subtopic LIKE ?');
      params.push(`%${subtopic}%`);
    }

    const whereSql = conditions.join(' AND ');
    const items = db
      .prepare(`${ARTICLE_SELECT} WHERE ${whereSql} ORDER BY a.published_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset);

    const totalRow = db
      .prepare(`
        SELECT COUNT(*) as total
        FROM articles a
        LEFT JOIN categories c ON c.id = a.category_id
        LEFT JOIN states s ON s.id = a.state_id
        WHERE ${whereSql}
      `)
      .get(...params) as { total: number };

    res.json({ articles: items, total: totalRow.total });
  });

  app.get('/api/articles/:slug', (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const article = db
      .prepare(`${ARTICLE_SELECT} WHERE a.slug = ? AND a.status = 'published'`)
      .get(slug) as Record<string, unknown> | undefined;

    if (!article) {
      res.status(404).json({ error: 'Article not found.' });
      return;
    }

    db.prepare('UPDATE articles SET views = views + 1 WHERE id = ?').run(article.id);
    db.prepare(`
      INSERT INTO analytics_events (id, event_type, path, article_id, category_slug, language)
      VALUES (?, 'article_view', ?, ?, ?, ?)
    `).run(
      `ana-${crypto.randomUUID().slice(0, 10)}`,
      `/news/${slug}`,
      String(article.id),
      String(article.category_slug || ''),
      String(article.language || 'en'),
    );

    const related = db
      .prepare(`
        ${ARTICLE_SELECT}
        WHERE a.status = 'published' AND a.id != ? AND (a.category_id = ? OR a.state_id = ?)
        ORDER BY a.published_at DESC LIMIT 4
      `)
      .all(article.id, article.category_id, article.state_id);

    const comments = db
      .prepare(`
        SELECT id, article_id, author_name, body, created_at
        FROM comments
        WHERE article_id = ? AND status = 'approved'
        ORDER BY created_at DESC
        LIMIT 100
      `)
      .all(article.id);

    res.json({ article, related, comments });
  });

  app.post('/api/articles/:slug/comments', (req, res) => {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`comment:${ip}`, 8, 10 * 60_000)) {
      res.status(429).json({ error: 'Too many comments submitted. Please wait a few minutes.' });
      return;
    }

    const slug = String(req.params.slug || '').trim();
    const article = db
      .prepare("SELECT id FROM articles WHERE slug = ? AND status = 'published'")
      .get(slug) as { id: string } | undefined;
    if (!article) {
      res.status(404).json({ error: 'Article not found.' });
      return;
    }

    const authorName = String(req.body?.author_name || '').trim().slice(0, 80);
    const authorEmail = String(req.body?.author_email || '').trim().toLowerCase().slice(0, 120);
    const body = String(req.body?.body || '').trim().slice(0, 1500);
    const readerId = String(req.body?.reader_id || '').trim().slice(0, 40);

    if (authorName.length < 2 || body.length < 4) {
      res.status(400).json({ error: 'Name and comment (at least 4 characters) are required.' });
      return;
    }

    const id = `cmt-${crypto.randomUUID().slice(0, 10)}`;
    db.prepare(`
      INSERT INTO comments (id, article_id, reader_id, author_name, author_email, body, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(id, article.id, readerId, authorName, authorEmail, body);

    res.status(201).json({
      ok: true,
      message: 'Comment submitted for editorial moderation and will appear once approved.',
    });
  });

  app.get('/api/categories', (_req, res) => {
    const rows = db
      .prepare(`
        SELECT c.*, COUNT(a.id) as article_count
        FROM categories c
        LEFT JOIN articles a ON a.category_id = c.id AND a.status = 'published'
        GROUP BY c.id
        ORDER BY c.name ASC
      `)
      .all();
    res.json({ categories: rows });
  });

  app.get('/api/states', (_req, res) => {
    const rows = db
      .prepare(`
        SELECT s.*, COUNT(a.id) as article_count
        FROM states s
        LEFT JOIN articles a ON a.state_id = s.id AND a.status = 'published'
        GROUP BY s.id
        ORDER BY s.type ASC, s.name ASC
      `)
      .all();
    res.json({ states: rows });
  });

  app.get('/api/editions', (req, res) => {
    const month = String(req.query.month || '').trim();
    let rows;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      rows = db
        .prepare("SELECT * FROM editions WHERE status = 'published' AND strftime('%Y-%m', edition_date) = ? ORDER BY edition_date DESC")
        .all(month);
    } else {
      rows = db.prepare("SELECT * FROM editions WHERE status = 'published' ORDER BY edition_date DESC LIMIT 60").all();
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ editions: rows });
  });

  app.get('/api/editions/:id/html', (req, res) => {
    const idOrDate = String(req.params.id || '').trim();
    const edition = db
      .prepare('SELECT * FROM editions WHERE id = ? OR edition_date = ?')
      .get(idOrDate, idOrDate) as
      | { id: string; edition_date: string; title: string; content_json: string }
      | undefined;

    if (!edition) {
      res.status(404).send('Edition not found');
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderEditionPrintableHtml(edition));
  });

  app.get('/api/ads', (req, res) => {
    const placement = String(req.query.placement || '').trim();
    const lang = req.query.lang === 'hi' || req.query.lang === 'en' ? req.query.lang : null;
    const todayIst = getTodayIndiaDate();

    const conditions = [
      'active = 1',
      "(start_date = '' OR date(start_date) <= date(?))",
      "(end_date = '' OR date(end_date) >= date(?))",
    ];
    const params: unknown[] = [todayIst, todayIst];

    if (placement && (VALID_AD_PLACEMENTS as readonly string[]).includes(placement)) {
      conditions.push('placement = ?');
      params.push(placement);
    }
    if (lang) {
      conditions.push("(language = 'all' OR language = ?)");
      params.push(lang);
    }

    const ads = db
      .prepare(`SELECT * FROM ads WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 20`)
      .all(...params);

    res.setHeader('Cache-Control', 'no-store');
    res.json({ ads });
  });

  app.post('/api/ads/:id/track', (req, res) => {
    const id = String(req.params.id || '').trim();
    const event = req.body?.event === 'click' ? 'click' : 'impression';
    if (!id) {
      res.status(400).json({ error: 'Ad ID required.' });
      return;
    }
    if (event === 'click') {
      db.prepare('UPDATE ads SET clicks = clicks + 1 WHERE id = ?').run(id);
    } else {
      db.prepare('UPDATE ads SET impressions = impressions + 1 WHERE id = ?').run(id);
    }
    res.json({ ok: true });
  });

  app.post('/api/analytics/event', (req, res) => {
    const eventType = String(req.body?.event_type || 'page_view').slice(0, 40);
    const pagePath = String(req.body?.path || '/').slice(0, 200);
    const articleId = String(req.body?.article_id || '').slice(0, 40);
    const categorySlug = String(req.body?.category_slug || '').slice(0, 40);
    const language = req.body?.language === 'hi' || req.body?.language === 'en' ? req.body.language : 'all';

    db.prepare(`
      INSERT INTO analytics_events (id, event_type, path, article_id, category_slug, language)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(`ana-${crypto.randomUUID().slice(0, 10)}`, eventType, pagePath, articleId, categorySlug, language);

    res.json({ ok: true });
  });

  // ---------------- CONTACT & DOUBLE OPT-IN NEWSLETTER ----------------

  app.post('/api/contact', async (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`contact:${ip}`, 5, 10 * 60_000)) {
      res.status(429).json({ error: 'Too many submissions. Please wait a few minutes before sending another message.' });
      return;
    }

    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const message = String(req.body?.message || '').trim();
    const inquiryType = String(req.body?.inquiryType || 'general').trim();

    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || subject.length < 3 || message.length < 10) {
      res.status(400).json({ error: 'Please provide a valid name, email, subject, and message (minimum 10 characters).' });
      return;
    }

    const emailResult = await sendAdminContactNotification({
      name,
      email,
      phone,
      subject,
      message,
      inquiryType,
    });

    const id = `cnt-${crypto.randomUUID().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO contacts (id, name, email, phone, subject, message, inquiry_type, status, email_sent)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)
    `).run(id, name, email, phone, subject, message, inquiryType, emailResult.sent ? 1 : 0);

    res.status(201).json({
      ok: true,
      id,
      emailSent: emailResult.sent,
      message: emailResult.note,
    });
  });

  app.post('/api/newsletter', async (req, res) => {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`newsletter:${ip}`, 8, 10 * 60_000)) {
      res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
      return;
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const langPref = req.body?.language_pref === 'hi' || req.body?.language_pref === 'en' ? req.body.language_pref : 'all';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const confirmToken = crypto.randomBytes(18).toString('hex');
    const unsubscribeToken = crypto.randomBytes(18).toString('hex');

    const existing = db
      .prepare('SELECT id, confirmed, status, unsubscribe_token FROM newsletter_subscribers WHERE email = ?')
      .get(email) as
      | { id: string; confirmed: number; status: string; unsubscribe_token: string }
      | undefined;

    if (existing && existing.confirmed === 1 && existing.status === 'active') {
      res.json({ ok: true, confirmed: true, message: 'You are already confirmed for the Maheep Daily Briefing.' });
      return;
    }

    if (existing) {
      db.prepare(`
        UPDATE newsletter_subscribers
        SET status = 'active', confirmed = 0, confirm_token = ?,
            unsubscribe_token = COALESCE(NULLIF(unsubscribe_token, ''), ?),
            language_pref = ?
        WHERE id = ?
      `).run(confirmToken, unsubscribeToken, langPref, existing.id);
    } else {
      db.prepare(`
        INSERT INTO newsletter_subscribers (
          id, email, status, confirmed, confirm_token, unsubscribe_token, language_pref, digest_frequency
        ) VALUES (?, ?, 'active', 0, ?, ?, ?, 'daily')
      `).run(`sub-${crypto.randomUUID().slice(0, 8)}`, email, confirmToken, unsubscribeToken, langPref);
    }

    const mailRes = await sendNewsletterConfirmationEmail({
      email,
      confirmToken,
      unsubscribeToken: existing?.unsubscribe_token || unsubscribeToken,
      origin: resolvePublicBaseUrl(req),
    });

    res.status(201).json({
      ok: true,
      confirmed: false,
      emailSent: mailRes.sent,
      confirmUrl: mailRes.sent ? undefined : `/api/newsletter/confirm/${confirmToken}`,
      message: mailRes.sent
        ? 'Please check your inbox and click the verification link to confirm your Daily Briefing subscription.'
        : 'Subscription recorded. Verification email requires SMTP settings; click the confirm link to activate immediately.',
    });
  });

  app.get('/api/newsletter/confirm/:token', (req, res) => {
    const token = String(req.params.token || '').trim();
    const row = db
      .prepare('SELECT id, email FROM newsletter_subscribers WHERE confirm_token = ?')
      .get(token) as { id: string; email: string } | undefined;

    if (!row) {
      res.status(404).send('<h2>Verification link expired or invalid.</h2><p><a href="/">Return to Maheep News Portal</a></p>');
      return;
    }

    db.prepare("UPDATE newsletter_subscribers SET confirmed = 1, status = 'active', confirm_token = '' WHERE id = ?").run(row.id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html><body style="font-family:sans-serif;max-width:520px;margin:60px auto;padding:24px;border:1px solid #d1d5db;border-radius:8px;"><h1 style="color:#00652E;">Subscription Confirmed</h1><p><strong>${escapeHtml(row.email)}</strong> is now verified for the Maheep News Portal Morning Briefing.</p><p><a href="/" style="color:#00652E;font-weight:bold;">Return to Maheep News Portal</a></p></body></html>`);
  });

  app.get('/api/newsletter/unsubscribe/:token', (req, res) => {
    const token = String(req.params.token || '').trim();
    const row = db
      .prepare('SELECT id, email FROM newsletter_subscribers WHERE unsubscribe_token = ? OR id = ?')
      .get(token, token) as { id: string; email: string } | undefined;

    if (!row) {
      res.status(404).send('<h2>Subscriber record not found.</h2><p><a href="/">Return to Maheep News Portal</a></p>');
      return;
    }

    db.prepare("UPDATE newsletter_subscribers SET status = 'unsubscribed' WHERE id = ?").run(row.id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html><body style="font-family:sans-serif;max-width:520px;margin:60px auto;padding:24px;border:1px solid #d1d5db;border-radius:8px;"><h1 style="color:#00652E;">Unsubscribed</h1><p><strong>${escapeHtml(row.email)}</strong> has been unsubscribed from Maheep News Portal digests.</p><p><a href="/" style="color:#00652E;font-weight:bold;">Return to Maheep News Portal</a></p></body></html>`);
  });

  // ---------------- OPTIONAL READER ACCOUNTS & WEB PUSH ----------------

  app.post('/api/reader/register', (req, res) => {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`reader-reg:${ip}`, 6, 10 * 60_000)) {
      res.status(429).json({ error: 'Too many registration attempts. Please try again later.' });
      return;
    }
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) {
      res.status(400).json({ error: 'Name, valid email, and password (min 6 characters) required.' });
      return;
    }

    try {
      const session = registerReaderAccount(name, email, password);
      res.status(201).json(session);
    } catch (err) {
      res.status(409).json({ error: err instanceof Error ? err.message : 'Registration failed.' });
    }
  });

  app.post('/api/reader/login', (req, res) => {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`reader-login:${ip}`, 10, 10 * 60_000)) {
      res.status(429).json({ error: 'Too many login attempts. Please wait a few minutes.' });
      return;
    }
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const session = authenticateReaderAccount(email, password);
    if (!session) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    res.json(session);
  });

  app.get('/api/reader/me', requireReader, (req: ReaderAuthenticatedRequest, res) => {
    const user = db
      .prepare('SELECT id, name, email, preferred_language, font_size, created_at FROM reader_users WHERE id = ?')
      .get(req.readerUser?.sub || '');
    if (!user) {
      res.status(404).json({ error: 'Reader account not found.' });
      return;
    }
    res.json({ user });
  });

  app.patch('/api/reader/preferences', requireReader, (req: ReaderAuthenticatedRequest, res) => {
    const lang = ['all', 'en', 'hi'].includes(req.body?.preferred_language) ? req.body.preferred_language : undefined;
    const fontSize = ['sm', 'md', 'lg'].includes(req.body?.font_size) ? req.body.font_size : undefined;
    const readerId = req.readerUser?.sub || '';

    if (lang) {
      db.prepare('UPDATE reader_users SET preferred_language = ? WHERE id = ?').run(lang, readerId);
    }
    if (fontSize) {
      db.prepare('UPDATE reader_users SET font_size = ? WHERE id = ?').run(fontSize, readerId);
    }
    const user = db
      .prepare('SELECT id, name, email, preferred_language, font_size FROM reader_users WHERE id = ?')
      .get(readerId);
    res.json({ user });
  });

  app.get('/api/reader/bookmarks', requireReader, (req: ReaderAuthenticatedRequest, res) => {
    const items = db
      .prepare(`
        ${ARTICLE_SELECT}
        INNER JOIN reader_bookmarks b ON b.article_id = a.id
        WHERE b.reader_id = ? AND a.status = 'published'
        ORDER BY b.created_at DESC
        LIMIT 100
      `)
      .all(req.readerUser?.sub || '');
    res.json({ bookmarks: items });
  });

  app.post('/api/reader/bookmarks', requireReader, (req: ReaderAuthenticatedRequest, res) => {
    const articleId = String(req.body?.article_id || '').trim();
    if (!articleId) {
      res.status(400).json({ error: 'Article ID required.' });
      return;
    }
    db.prepare(`
      INSERT OR IGNORE INTO reader_bookmarks (id, reader_id, article_id)
      VALUES (?, ?, ?)
    `).run(`bmk-${crypto.randomUUID().slice(0, 10)}`, req.readerUser?.sub || '', articleId);
    res.status(201).json({ ok: true });
  });

  app.delete('/api/reader/bookmarks/:articleId', requireReader, (req: ReaderAuthenticatedRequest, res) => {
    db.prepare('DELETE FROM reader_bookmarks WHERE reader_id = ? AND article_id = ?').run(
      req.readerUser?.sub || '',
      String(req.params.articleId || ''),
    );
    res.json({ ok: true });
  });

  app.get('/api/reader/history', requireReader, (req: ReaderAuthenticatedRequest, res) => {
    const items = db
      .prepare(`
        ${ARTICLE_SELECT}, h.read_at
        FROM articles a
        LEFT JOIN categories c ON c.id = a.category_id
        LEFT JOIN states s ON s.id = a.state_id
        INNER JOIN reader_history h ON h.article_id = a.id
        WHERE h.reader_id = ? AND a.status = 'published'
        ORDER BY h.read_at DESC
        LIMIT 50
      `)
      .all(req.readerUser?.sub || '');
    res.json({ history: items });
  });

  app.post('/api/reader/history', requireReader, (req: ReaderAuthenticatedRequest, res) => {
    const articleId = String(req.body?.article_id || '').trim();
    if (!articleId) {
      res.status(400).json({ error: 'Article ID required.' });
      return;
    }
    db.prepare(`
      INSERT INTO reader_history (id, reader_id, article_id, read_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(reader_id, article_id) DO UPDATE SET read_at = datetime('now')
    `).run(`his-${crypto.randomUUID().slice(0, 10)}`, req.readerUser?.sub || '', articleId);
    res.json({ ok: true });
  });

  app.get('/api/push/vapid-key', (_req, res) => {
    const { publicKey } = ensureVapidConfigured();
    res.json({ publicKey });
  });

  app.post('/api/push/subscribe', (req, res) => {
    const sub = req.body?.subscription;
    const endpoint = String(sub?.endpoint || '').trim();
    const p256dh = String(sub?.keys?.p256dh || '').trim();
    const auth = String(sub?.keys?.auth || '').trim();
    if (!endpoint || !p256dh || !auth) {
      res.status(400).json({ error: 'Valid push subscription payload required.' });
      return;
    }
    savePushSubscription({ endpoint, p256dh, auth, language: String(req.body?.language || 'all') });
    res.status(201).json({ ok: true });
  });

  app.post('/api/push/unsubscribe', (req, res) => {
    const endpoint = String(req.body?.endpoint || '').trim();
    if (endpoint) removePushSubscription(endpoint);
    res.json({ ok: true });
  });

  // Safe uploaded image serving with strict path confinement
  app.get('/uploads/:filename', (req, res) => {
    const cleanName = path.basename(String(req.params.filename || ''));
    const resolved = path.resolve(uploadsDir, cleanName);
    if (!resolved.startsWith(uploadsDir + path.sep) || !fs.existsSync(resolved)) {
      res.status(404).end();
      return;
    }
    res.sendFile(resolved);
  });

  // ---------------- ADMIN AUTH ----------------

  app.get('/api/admin/auth/status', (_req, res) => {
    const setupNeeded = isAdminSetupNeeded();
    const envPasscodeConfigured = Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
    res.json({ needsSetup: setupNeeded, envPasscodeConfigured });
  });

  app.post('/api/admin/auth/claim', (req, res) => {
    if (!isAdminSetupNeeded()) {
      res.status(403).json({ error: 'Admin access is already configured. Please sign in.' });
      return;
    }
    const email = String(req.body?.email || 'maheepmedia@gmail.com').trim().toLowerCase();
    const name = String(req.body?.name || 'Maheep Editorial Chief').trim();
    const password = String(req.body?.password || '');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      res.status(400).json({ error: 'Valid email and password (minimum 8 characters) are required.' });
      return;
    }

    const { hash, salt } = hashPassword(password);
    const existing = db.prepare('SELECT id, role FROM admin_users WHERE email = ?').get(email) as
      | { id: string; role: 'super_admin' | 'admin' | 'editor' }
      | undefined;

    let userId: string;
    let role: 'super_admin' | 'admin' | 'editor' = 'super_admin';

    if (existing) {
      userId = existing.id;
      role = existing.role;
      db.prepare('UPDATE admin_users SET name = ?, password_hash = ?, password_salt = ? WHERE id = ?').run(
        name,
        hash,
        salt,
        userId,
      );
    } else {
      userId = `adm-${crypto.randomUUID().slice(0, 8)}`;
      db.prepare(
        'INSERT INTO admin_users (id, name, email, role, password_hash, password_salt) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(userId, name, email, role, hash, salt);
    }

    const token = signToken({ sub: userId, email, name, role });
    recordAdminAudit({ actorId: userId, actorEmail: email, actorRole: role, action: 'admin_claim', targetType: 'admin_user', targetId: userId });
    res.json({ token, user: { id: userId, email, name, role } });
  });

  app.post('/api/admin/auth/login', (req, res) => {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`admin-login:${ip}`, 10, 10 * 60_000)) {
      res.status(429).json({ error: 'Too many login attempts. Please wait a few minutes.' });
      return;
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const envPasscode = process.env.ADMIN_PASSCODE?.trim();

    if (envPasscode && password === envPasscode) {
      const adminRow = db.prepare('SELECT id, name, email, role FROM admin_users WHERE email = ?').get(email) as
        | { id: string; name: string; email: string; role: 'super_admin' | 'admin' | 'editor' }
        | undefined;
      if (!adminRow) {
        res.status(401).json({ error: 'Email is not registered as an editorial administrator.' });
        return;
      }
      const token = signToken({ sub: adminRow.id, email: adminRow.email, name: adminRow.name, role: adminRow.role });
      recordAdminAudit({ actorId: adminRow.id, actorEmail: adminRow.email, actorRole: adminRow.role, action: 'admin_login_passcode', targetType: 'session' });
      res.json({ token, user: adminRow });
      return;
    }

    const user = db.prepare('SELECT * FROM admin_users WHERE email = ?').get(email) as
      | {
          id: string;
          name: string;
          email: string;
          role: 'super_admin' | 'admin' | 'editor';
          password_hash: string;
          password_salt: string;
        }
      | undefined;

    if (!user || !verifyPassword(password, user.password_hash, user.password_salt)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = signToken({ sub: user.id, email: user.email, name: user.name, role: user.role });
    recordAdminAudit({ actorId: user.id, actorEmail: user.email, actorRole: user.role, action: 'admin_login', targetType: 'session' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  });

  app.get('/api/admin/me', requireAdmin, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.adminUser });
  });

  // ---------------- ADMIN OVERVIEW ----------------

  app.get('/api/admin/overview', requireAdmin, (_req, res) => {
    const stats = db
      .prepare(`
        SELECT
          COUNT(*) as totalArticles,
          SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as publishedArticles,
          SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draftArticles,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingArticles,
          SUM(CASE WHEN scheduled_at IS NOT NULL AND scheduled_at != '' AND status IN ('draft','pending') THEN 1 ELSE 0 END) as scheduledArticles,
          SUM(CASE WHEN breaking_candidate = 1 AND breaking = 0 AND status != 'archived' THEN 1 ELSE 0 END) as breakingCandidates,
          SUM(CASE WHEN date(datetime(published_at, '+5 hours', '+30 minutes')) = date(?) THEN 1 ELSE 0 END) as todaysArticles
        FROM articles
      `)
      .get(getTodayIndiaDate());

    const editions = (db.prepare('SELECT COUNT(*) as total FROM editions').get() as { total: number }).total;
    const adsActive = (db.prepare('SELECT COUNT(*) as total FROM ads WHERE active = 1').get() as { total: number }).total;
    const contactsNew = (db.prepare("SELECT COUNT(*) as total FROM contacts WHERE status = 'new'").get() as { total: number }).total;
    const commentsPending = (db.prepare("SELECT COUNT(*) as total FROM comments WHERE status = 'pending'").get() as { total: number }).total;
    const subscribers = (db.prepare("SELECT COUNT(*) as total FROM newsletter_subscribers WHERE status = 'active'").get() as { total: number }).total;
    const pushSubscribers = (db.prepare('SELECT COUNT(*) as total FROM push_subscriptions').get() as { total: number }).total;
    const rssSources = db.prepare('SELECT id, name, enabled, last_fetched_at, last_error, imported_count FROM rss_sources').all();
    const recentLogs = db.prepare('SELECT * FROM rss_import_logs ORDER BY ran_at DESC LIMIT 12').all();

    res.json({
      stats,
      editions,
      adsActive,
      contactsNew,
      commentsPending,
      subscribers,
      pushSubscribers,
      rssSources,
      recentLogs,
      scheduling: {
        lastRunAt: getSetting('rss_last_run_at', ''),
        nextRunAt: getSetting('rss_next_run_at', ''),
        intervalMinutes: Number(getSetting('rss_interval_minutes', '30')),
        publishingMode: getSetting('publishing_mode', 'manual_approval'),
      },
    });
  });

  // ---------------- ADMIN ARTICLES CRUD, SCHEDULING, REVISIONS, PREVIEW & CALENDAR ----------------

  app.get('/api/admin/articles', requireAdmin, (req, res) => {
    const status = String(req.query.status || '').trim();
    const language = String(req.query.language || '').trim();
    const category = String(req.query.category || '').trim();
    const q = String(req.query.q || '').trim();

    const conditions = ['1=1'];
    const params: unknown[] = [];

    if (status === 'scheduled') {
      conditions.push("a.scheduled_at IS NOT NULL AND a.scheduled_at != '' AND a.status IN ('draft','pending')");
    } else if (status === 'breaking_candidate') {
      conditions.push('a.breaking_candidate = 1');
    } else if (status && status !== 'all') {
      conditions.push('a.status = ?');
      params.push(status);
    }
    if (language === 'en' || language === 'hi') {
      conditions.push('a.language = ?');
      params.push(language);
    }
    if (category && category !== 'all') {
      conditions.push('c.slug = ?');
      params.push(category);
    }
    if (q) {
      conditions.push('(a.title LIKE ? OR a.summary LIKE ? OR a.source_name LIKE ?)');
      const pat = `%${q}%`;
      params.push(pat, pat, pat);
    }

    const articles = db
      .prepare(`${ARTICLE_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY a.created_at DESC LIMIT 200`)
      .all(...params);
    res.json({ articles });
  });

  app.get('/api/admin/articles/:id/preview', requireAdmin, (req, res) => {
    const article = db.prepare(`${ARTICLE_SELECT} WHERE a.id = ?`).get(String(req.params.id || ''));
    if (!article) {
      res.status(404).json({ error: 'Article not found.' });
      return;
    }
    res.json({ article });
  });

  app.get('/api/admin/articles/:id/revisions', requireAdmin, (req, res) => {
    const revisions = db
      .prepare('SELECT * FROM article_revisions WHERE article_id = ? ORDER BY created_at DESC LIMIT 30')
      .all(String(req.params.id || ''));
    res.json({ revisions });
  });

  app.post('/api/admin/articles/:id/revisions/:revId/restore', requireAdmin, (req: AuthenticatedRequest, res) => {
    const articleId = String(req.params.id || '');
    const revId = String(req.params.revId || '');
    const current = db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId) as Record<string, unknown> | undefined;
    const rev = db
      .prepare('SELECT * FROM article_revisions WHERE id = ? AND article_id = ?')
      .get(revId, articleId) as
      | { title: string; summary: string; content: string; status: string }
      | undefined;

    if (!current || !rev) {
      res.status(404).json({ error: 'Article or revision not found.' });
      return;
    }

    // Snapshot current before restoring
    db.prepare(`
      INSERT INTO article_revisions (id, article_id, editor_email, title, summary, content, status, change_note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `rev-${crypto.randomUUID().slice(0, 10)}`,
      articleId,
      req.adminUser?.email || 'admin',
      String(current.title),
      String(current.summary),
      String(current.content),
      String(current.status),
      `Before restore of revision ${revId}`,
    );

    db.prepare(`
      UPDATE articles
      SET title = ?, summary = ?, content = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(rev.title, rev.summary, rev.content, rev.status, articleId);

    recordAdminAudit({ req, action: 'article_revision_restore', targetType: 'article', targetId: articleId, details: { revId } });
    res.json({ article: db.prepare(`${ARTICLE_SELECT} WHERE a.id = ?`).get(articleId) });
  });

  app.get('/api/admin/calendar', requireAdmin, (_req, res) => {
    const items = db
      .prepare(`
        SELECT a.id, a.title, a.slug, a.status, a.language, a.published_at, a.scheduled_at, a.unpublish_at,
               a.featured, a.breaking, c.name as category_name
        FROM articles a
        LEFT JOIN categories c ON c.id = a.category_id
        WHERE a.scheduled_at IS NOT NULL
           OR a.unpublish_at IS NOT NULL
           OR datetime(a.published_at) >= datetime('now', '-14 days')
        ORDER BY COALESCE(a.scheduled_at, a.published_at, a.created_at) DESC
        LIMIT 120
      `)
      .all();
    res.json({ items });
  });

  app.post('/api/admin/articles', requireAdmin, (req: AuthenticatedRequest, res) => {
    const title = String(req.body?.title || '').trim();
    const summary = String(req.body?.summary || '').trim();
    const content = String(req.body?.content || '').trim();
    if (title.length < 4 || summary.length < 10) {
      res.status(400).json({ error: 'Headline and summary are required.' });
      return;
    }

    const status = ['draft', 'pending', 'published', 'archived'].includes(req.body?.status)
      ? req.body.status
      : 'draft';
    const scheduledAt = req.body?.scheduled_at ? String(req.body.scheduled_at).trim() : null;
    const unpublishAt = req.body?.unpublish_at ? String(req.body.unpublish_at).trim() : null;
    const language = req.body?.language === 'hi' ? 'hi' : 'en';
    const id = `art-${crypto.randomUUID().slice(0, 10)}`;
    const slug = createSlug(title);
    const publishedAt = status === 'published' ? new Date().toISOString() : null;
    const reviewedBy = status === 'published' || status === 'archived' ? req.adminUser?.email || '' : '';
    const reviewedAt = reviewedBy ? new Date().toISOString() : null;

    db.prepare(`
      INSERT INTO articles (
        id, title, slug, summary, content, image_url, source_name, source_url,
        author, language, category_id, state_id, subtopic, status, featured, breaking,
        ai_assisted, published_at, scheduled_at, unpublish_at, reviewed_by, reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      title,
      slug,
      summary,
      content || summary,
      sanitizeSafeUrl(req.body?.image_url),
      String(req.body?.source_name || 'Maheep News Desk').trim(),
      sanitizeSafeUrl(req.body?.source_url),
      String(req.body?.author || 'Maheep Editorial Desk').trim(),
      language,
      req.body?.category_id || 'cat-national',
      req.body?.state_id || null,
      String(req.body?.subtopic || '').trim(),
      status,
      req.body?.featured ? 1 : 0,
      req.body?.breaking ? 1 : 0,
      req.body?.ai_assisted ? 1 : 0,
      publishedAt,
      scheduledAt,
      unpublishAt,
      reviewedBy,
      reviewedAt,
    );

    recordAdminAudit({ req, action: 'article_create', targetType: 'article', targetId: id, details: { status, scheduledAt } });
    const created = db.prepare(`${ARTICLE_SELECT} WHERE a.id = ?`).get(id);
    res.status(201).json({ article: created });
  });

  app.patch('/api/admin/articles/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id || '');
    const existing = db.prepare('SELECT * FROM articles WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Article not found.' });
      return;
    }

    // Save immutable revision snapshot prior to edit
    db.prepare(`
      INSERT INTO article_revisions (id, article_id, editor_email, title, summary, content, status, change_note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `rev-${crypto.randomUUID().slice(0, 10)}`,
      id,
      req.adminUser?.email || 'editorial',
      String(existing.title || ''),
      String(existing.summary || ''),
      String(existing.content || ''),
      String(existing.status || 'draft'),
      String(req.body?.change_note || 'Editorial update'),
    );

    const nextStatus = ['draft', 'pending', 'published', 'archived'].includes(req.body?.status)
      ? req.body.status
      : existing.status;

    const publishedAt =
      nextStatus === 'published' && !existing.published_at ? new Date().toISOString() : existing.published_at;
    const reviewedBy =
      nextStatus !== existing.status && (nextStatus === 'published' || nextStatus === 'archived')
        ? req.adminUser?.email || ''
        : existing.reviewed_by || '';
    const reviewedAt =
      nextStatus !== existing.status && (nextStatus === 'published' || nextStatus === 'archived')
        ? new Date().toISOString()
        : existing.reviewed_at || null;

    db.prepare(`
      UPDATE articles SET
        title = ?,
        summary = ?,
        content = ?,
        image_url = ?,
        source_name = ?,
        source_url = ?,
        author = ?,
        language = ?,
        category_id = ?,
        state_id = ?,
        subtopic = ?,
        status = ?,
        featured = ?,
        breaking = ?,
        scheduled_at = ?,
        unpublish_at = ?,
        reviewed_by = ?,
        reviewed_at = ?,
        published_at = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      req.body?.title !== undefined ? String(req.body.title).trim() : existing.title,
      req.body?.summary !== undefined ? String(req.body.summary).trim() : existing.summary,
      req.body?.content !== undefined ? String(req.body.content).trim() : existing.content,
      req.body?.image_url !== undefined ? sanitizeSafeUrl(req.body.image_url) : existing.image_url,
      req.body?.source_name !== undefined ? String(req.body.source_name).trim() : existing.source_name,
      req.body?.source_url !== undefined ? sanitizeSafeUrl(req.body.source_url) : existing.source_url,
      req.body?.author !== undefined ? String(req.body.author).trim() : existing.author,
      req.body?.language === 'hi' || req.body?.language === 'en' ? req.body.language : existing.language,
      req.body?.category_id !== undefined ? req.body.category_id : existing.category_id,
      req.body?.state_id !== undefined ? req.body.state_id || null : existing.state_id,
      req.body?.subtopic !== undefined ? String(req.body.subtopic).trim() : existing.subtopic,
      nextStatus,
      req.body?.featured !== undefined ? (req.body.featured ? 1 : 0) : existing.featured,
      req.body?.breaking !== undefined ? (req.body.breaking ? 1 : 0) : existing.breaking,
      req.body?.scheduled_at !== undefined ? (req.body.scheduled_at || null) : existing.scheduled_at,
      req.body?.unpublish_at !== undefined ? (req.body.unpublish_at || null) : existing.unpublish_at,
      reviewedBy,
      reviewedAt,
      publishedAt,
      id,
    );

    recordAdminAudit({ req, action: 'article_update', targetType: 'article', targetId: id, details: { status: nextStatus } });
    const updated = db.prepare(`${ARTICLE_SELECT} WHERE a.id = ?`).get(id);
    res.json({ article: updated });
  });

  app.delete('/api/admin/articles/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id || '');
    db.prepare('DELETE FROM articles WHERE id = ?').run(id);
    recordAdminAudit({ req, action: 'article_delete', targetType: 'article', targetId: id });
    res.json({ ok: true });
  });

  app.post('/api/admin/articles/bulk', requireAdmin, (req: AuthenticatedRequest, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    const action = String(req.body?.action || '');
    if (ids.length === 0) {
      res.status(400).json({ error: 'No articles selected.' });
      return;
    }

    const actor = req.adminUser?.email || '';
    const tx = db.transaction((targetIds: string[]) => {
      for (const id of targetIds) {
        if (action === 'publish') {
          db.prepare(
            "UPDATE articles SET status = 'published', published_at = COALESCE(published_at, datetime('now')), reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
          ).run(actor, id);
        } else if (action === 'unpublish') {
          db.prepare("UPDATE articles SET status = 'draft', updated_at = datetime('now') WHERE id = ?").run(id);
        } else if (action === 'delete') {
          db.prepare('DELETE FROM articles WHERE id = ?').run(id);
        }
      }
    });
    tx(ids);
    recordAdminAudit({ req, action: `article_bulk_${action}`, targetType: 'article', details: { count: ids.length } });
    res.json({ ok: true, affected: ids.length });
  });

  app.post('/api/admin/upload', requireAdmin, (req, res) => {
    const dataUrl = String(req.body?.dataUrl || '');
    const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) {
      res.status(400).json({ error: 'Invalid image format. Allowed: PNG, JPG, WEBP.' });
      return;
    }
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 3 * 1024 * 1024) {
      res.status(400).json({ error: 'Image size exceeds 3 MB limit.' });
      return;
    }
    const filename = `img-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const dest = path.resolve(uploadsDir, filename);
    if (!dest.startsWith(uploadsDir + path.sep)) {
      res.status(400).json({ error: 'Invalid destination path.' });
      return;
    }
    fs.writeFileSync(dest, buffer);
    res.json({ url: `/uploads/${filename}` });
  });

  // ---------------- ADMIN AI ASSISTANT ----------------

  app.post('/api/ai/assist', requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const action = req.body?.action as AiAssistAction;
      const title = String(req.body?.title || '').trim();
      if (!action || !title) {
        res.status(400).json({ error: 'Action and headline title are required.' });
        return;
      }
      const existingTitles = (
        db.prepare('SELECT title FROM articles ORDER BY created_at DESC LIMIT 20').all() as Array<{ title: string }>
      ).map((r) => r.title);

      const result = await runEditorialAiAssist({
        action,
        title,
        articleId: req.body?.articleId ? String(req.body.articleId) : undefined,
        actorEmail: req.adminUser?.email || 'editorial',
        summary: String(req.body?.summary || ''),
        content: String(req.body?.content || ''),
        sourceName: String(req.body?.sourceName || ''),
        sourceUrl: String(req.body?.sourceUrl || ''),
        language: req.body?.language === 'hi' ? 'hi' : 'en',
        existingTitles,
      });
      res.json({ ok: true, result });
    } catch (err) {
      res.status(503).json({
        error: err instanceof Error ? err.message : 'AI service error.',
      });
    }
  });

  // ---------------- ADMIN RSS ENGINE ----------------

  app.get('/api/admin/rss', requireAdmin, (_req, res) => {
    const sources = db
      .prepare(`
        SELECT r.*, c.name as category_name
        FROM rss_sources r
        LEFT JOIN categories c ON c.id = r.category_id
        ORDER BY r.created_at ASC
      `)
      .all();
    const logs = db.prepare('SELECT * FROM rss_import_logs ORDER BY ran_at DESC LIMIT 30').all();
    res.json({ sources, logs });
  });

  app.post('/api/admin/rss', requireAdmin, (req: AuthenticatedRequest, res) => {
    const name = String(req.body?.name || '').trim();
    const feedUrl = String(req.body?.feed_url || '').trim();
    const language = req.body?.language === 'hi' ? 'hi' : 'en';
    const categoryId = req.body?.category_id || 'cat-national';

    if (!name || !feedUrl) {
      res.status(400).json({ error: 'Feed name and URL are required.' });
      return;
    }
    try {
      validateExternalFeedUrl(feedUrl);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid URL' });
      return;
    }

    const id = `rss-${crypto.randomUUID().slice(0, 8)}`;
    try {
      db.prepare(
        'INSERT INTO rss_sources (id, name, feed_url, language, category_id, enabled) VALUES (?, ?, ?, ?, ?, 1)',
      ).run(id, name, feedUrl, language, categoryId);
      recordAdminAudit({ req, action: 'rss_source_create', targetType: 'rss_source', targetId: id, details: { name } });
      res.status(201).json({ source: db.prepare('SELECT * FROM rss_sources WHERE id = ?').get(id) });
    } catch {
      res.status(409).json({ error: 'This RSS feed URL already exists.' });
    }
  });

  app.patch('/api/admin/rss/:id', requireAdmin, (req, res) => {
    const id = String(req.params.id || '');
    const existing = db.prepare('SELECT * FROM rss_sources WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'RSS source not found.' });
      return;
    }
    if (req.body?.feed_url) {
      try {
        validateExternalFeedUrl(String(req.body.feed_url));
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid URL' });
        return;
      }
    }

    db.prepare(`
      UPDATE rss_sources SET name = ?, feed_url = ?, language = ?, category_id = ?, enabled = ? WHERE id = ?
    `).run(
      req.body?.name !== undefined ? String(req.body.name).trim() : existing.name,
      req.body?.feed_url !== undefined ? String(req.body.feed_url).trim() : existing.feed_url,
      req.body?.language === 'hi' || req.body?.language === 'en' ? req.body.language : existing.language,
      req.body?.category_id !== undefined ? req.body.category_id : existing.category_id,
      req.body?.enabled !== undefined ? (req.body.enabled ? 1 : 0) : existing.enabled,
      id,
    );
    res.json({ source: db.prepare('SELECT * FROM rss_sources WHERE id = ?').get(id) });
  });

  app.delete('/api/admin/rss/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id || '');
    db.prepare('DELETE FROM rss_sources WHERE id = ?').run(id);
    recordAdminAudit({ req, action: 'rss_source_delete', targetType: 'rss_source', targetId: id });
    res.json({ ok: true });
  });

  app.post('/api/admin/rss/run', requireAdmin, async (_req, res) => {
    const results = await runAllEnabledRssSources();
    res.json({ ok: true, results });
  });

  app.post('/api/admin/rss/:id/run', requireAdmin, async (req, res) => {
    try {
      const result = await runSingleRssSource(String(req.params.id || ''));
      res.json({ ok: true, result });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Failed to run source' });
    }
  });

  app.post('/api/admin/rss/:id/test', requireAdmin, async (req, res) => {
    const source = db.prepare('SELECT * FROM rss_sources WHERE id = ?').get(String(req.params.id || '')) as
      | { name: string; feed_url: string }
      | undefined;
    if (!source) {
      res.status(404).json({ error: 'RSS source not found.' });
      return;
    }
    try {
      const items = await fetchAndParseFeed(source.feed_url, source.name);
      res.json({ ok: true, count: items.length, sample: items.slice(0, 3) });
    } catch (err) {
      res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Feed unreachable' });
    }
  });

  // ---------------- ADMIN E-PAPER EDITIONS ----------------

  app.get('/api/admin/editions', requireAdmin, (_req, res) => {
    const editions = db.prepare('SELECT * FROM editions ORDER BY edition_date DESC').all();
    res.json({ editions });
  });

  app.post('/api/admin/editions/generate', requireAdmin, (req: AuthenticatedRequest, res) => {
    const dateStr = String(req.body?.edition_date || getTodayIndiaDate()).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      res.status(400).json({ error: 'Invalid edition date (YYYY-MM-DD required).' });
      return;
    }
    try {
      const edition = generateEditionForDate(dateStr);
      recordAdminAudit({ req, action: 'epaper_generate', targetType: 'edition', targetId: dateStr });
      res.status(201).json({ edition });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Edition generation failed.' });
    }
  });

  app.delete('/api/admin/editions/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id || '');
    db.prepare('DELETE FROM editions WHERE id = ?').run(id);
    recordAdminAudit({ req, action: 'epaper_delete', targetType: 'edition', targetId: id });
    res.json({ ok: true });
  });

  // ---------------- ADMIN ADVERTISEMENTS ----------------

  app.get('/api/admin/ads', requireAdmin, (_req, res) => {
    const ads = db.prepare('SELECT * FROM ads ORDER BY created_at DESC').all();
    res.json({ ads });
  });

  app.post('/api/admin/ads', requireAdmin, (req: AuthenticatedRequest, res) => {
    const title = String(req.body?.title || '').trim();
    const advertiser = String(req.body?.advertiser || '').trim();
    const placement = String(req.body?.placement || 'sidebar').trim();
    const imageUrl = sanitizeSafeUrl(req.body?.image_url);
    const targetUrl = sanitizeAdTargetUrl(req.body?.target_url);
    const description = String(req.body?.description || '').trim().slice(0, 300);
    const ctaText = String(req.body?.cta_text || 'Learn More').trim().slice(0, 40) || 'Learn More';
    const language = req.body?.language === 'en' || req.body?.language === 'hi' ? req.body.language : 'all';
    const active = req.body?.active === false || req.body?.active === 0 ? 0 : 1;
    const startDate = String(req.body?.start_date || '').trim();
    const endDate = String(req.body?.end_date || '').trim();

    if (!title) {
      res.status(400).json({ error: 'Advertisement headline title is required.' });
      return;
    }
    if (!(VALID_AD_PLACEMENTS as readonly string[]).includes(placement)) {
      res.status(400).json({ error: 'Invalid ad placement slot.' });
      return;
    }
    if (req.body?.target_url && !targetUrl) {
      res.status(400).json({ error: 'Target URL must be a valid http(s) URL or internal path.' });
      return;
    }
    if ((startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) || (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
      res.status(400).json({ error: 'Start and end dates must use YYYY-MM-DD format.' });
      return;
    }

    const id = `ad-${crypto.randomUUID().slice(0, 10)}`;
    db.prepare(`
      INSERT INTO ads (
        id, title, advertiser, placement, image_url, target_url, description,
        cta_text, language, active, start_date, end_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, advertiser, placement, imageUrl, targetUrl, description, ctaText, language, active, startDate, endDate);

    recordAdminAudit({ req, action: 'ad_create', targetType: 'ad', targetId: id, details: { title, placement } });
    res.status(201).json({ ad: db.prepare('SELECT * FROM ads WHERE id = ?').get(id) });
  });

  app.patch('/api/admin/ads/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id || '').trim();
    const existing = db.prepare('SELECT * FROM ads WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Advertisement not found.' });
      return;
    }

    const placement =
      req.body?.placement !== undefined ? String(req.body.placement).trim() : String(existing.placement);
    if (!(VALID_AD_PLACEMENTS as readonly string[]).includes(placement)) {
      res.status(400).json({ error: 'Invalid ad placement slot.' });
      return;
    }

    const nextTarget =
      req.body?.target_url !== undefined ? sanitizeAdTargetUrl(req.body.target_url) : String(existing.target_url || '');
    if (req.body?.target_url && !nextTarget) {
      res.status(400).json({ error: 'Target URL must be a valid http(s) URL or internal path.' });
      return;
    }

    const startDate =
      req.body?.start_date !== undefined ? String(req.body.start_date || '').trim() : String(existing.start_date || '');
    const endDate =
      req.body?.end_date !== undefined ? String(req.body.end_date || '').trim() : String(existing.end_date || '');
    if ((startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) || (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
      res.status(400).json({ error: 'Start and end dates must use YYYY-MM-DD format.' });
      return;
    }

    const title = req.body?.title !== undefined ? String(req.body.title).trim() : String(existing.title);
    if (!title) {
      res.status(400).json({ error: 'Advertisement headline title cannot be empty.' });
      return;
    }

    db.prepare(`
      UPDATE ads SET
        title = ?,
        advertiser = ?,
        placement = ?,
        image_url = ?,
        target_url = ?,
        description = ?,
        cta_text = ?,
        language = ?,
        active = ?,
        start_date = ?,
        end_date = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      title,
      req.body?.advertiser !== undefined ? String(req.body.advertiser).trim() : existing.advertiser,
      placement,
      req.body?.image_url !== undefined ? sanitizeSafeUrl(req.body.image_url) : existing.image_url,
      nextTarget,
      req.body?.description !== undefined ? String(req.body.description).trim().slice(0, 300) : existing.description,
      req.body?.cta_text !== undefined ? String(req.body.cta_text).trim().slice(0, 40) || 'Learn More' : existing.cta_text,
      req.body?.language === 'all' || req.body?.language === 'en' || req.body?.language === 'hi'
        ? req.body.language
        : existing.language,
      req.body?.active !== undefined ? (req.body.active ? 1 : 0) : existing.active,
      startDate,
      endDate,
      id,
    );

    recordAdminAudit({ req, action: 'ad_update', targetType: 'ad', targetId: id });
    res.json({ ad: db.prepare('SELECT * FROM ads WHERE id = ?').get(id) });
  });

  app.delete('/api/admin/ads/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id || '');
    db.prepare('DELETE FROM ads WHERE id = ?').run(id);
    recordAdminAudit({ req, action: 'ad_delete', targetType: 'ad', targetId: id });
    res.json({ ok: true });
  });

  // ---------------- ADMIN COMMENTS, ANALYTICS & PUSH BROADCAST ----------------

  app.get('/api/admin/comments', requireAdmin, (req, res) => {
    const status = String(req.query.status || 'all');
    const where = status === 'pending' || status === 'approved' || status === 'rejected' ? 'WHERE cm.status = ?' : '';
    const params = where ? [status] : [];
    const comments = db
      .prepare(`
        SELECT cm.*, a.title as article_title, a.slug as article_slug
        FROM comments cm
        LEFT JOIN articles a ON a.id = cm.article_id
        ${where}
        ORDER BY cm.created_at DESC
        LIMIT 200
      `)
      .all(...params);
    res.json({ comments });
  });

  app.patch('/api/admin/comments/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
    const status = req.body?.status === 'approved' || req.body?.status === 'rejected' ? req.body.status : 'pending';
    const id = String(req.params.id || '');
    db.prepare('UPDATE comments SET status = ? WHERE id = ?').run(status, id);
    recordAdminAudit({ req, action: 'comment_moderate', targetType: 'comment', targetId: id, details: { status } });
    res.json({ ok: true });
  });

  app.delete('/api/admin/comments/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id || '');
    db.prepare('DELETE FROM comments WHERE id = ?').run(id);
    recordAdminAudit({ req, action: 'comment_delete', targetType: 'comment', targetId: id });
    res.json({ ok: true });
  });

  app.get('/api/admin/analytics', requireAdmin, (_req, res) => {
    const dailyViews = db
      .prepare(`
        SELECT date(datetime(created_at, '+5 hours', '+30 minutes')) as day, COUNT(*) as views
        FROM analytics_events
        WHERE datetime(created_at) >= datetime('now', '-14 days')
        GROUP BY day
        ORDER BY day ASC
      `)
      .all();

    const topArticles = db
      .prepare(`
        SELECT a.id, a.title, a.slug, a.views, a.language, c.name as category_name
        FROM articles a
        LEFT JOIN categories c ON c.id = a.category_id
        WHERE a.status = 'published'
        ORDER BY a.views DESC
        LIMIT 10
      `)
      .all();

    const categoryTotals = db
      .prepare(`
        SELECT COALESCE(c.name, 'Uncategorized') as category, COUNT(a.id) as articles, COALESCE(SUM(a.views), 0) as views
        FROM categories c
        LEFT JOIN articles a ON a.category_id = c.id AND a.status = 'published'
        GROUP BY c.id
        ORDER BY views DESC
      `)
      .all();

    const languageSplit = db
      .prepare(`
        SELECT language, COUNT(*) as count, COALESCE(SUM(views), 0) as views
        FROM articles
        WHERE status = 'published'
        GROUP BY language
      `)
      .all();

    const adTotals = db
      .prepare('SELECT COALESCE(SUM(impressions), 0) as impressions, COALESCE(SUM(clicks), 0) as clicks FROM ads')
      .get();

    const pushSubscribers = (db.prepare('SELECT COUNT(*) as total FROM push_subscriptions').get() as { total: number }).total;
    const readerAccounts = (db.prepare('SELECT COUNT(*) as total FROM reader_users').get() as { total: number }).total;

    res.json({
      dailyViews,
      topArticles,
      categoryTotals,
      languageSplit,
      adTotals,
      pushSubscribers,
      readerAccounts,
    });
  });

  app.post('/api/admin/push/broadcast', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    const url = sanitizeAdTargetUrl(req.body?.url || '/') || '/';
    const language = req.body?.language === 'hi' || req.body?.language === 'en' ? req.body.language : 'all';

    if (!title || !body) {
      res.status(400).json({ error: 'Notification title and message are required.' });
      return;
    }

    const result = await broadcastBreakingPush({ title, body, url, language });
    recordAdminAudit({ req, action: 'push_broadcast', targetType: 'push', details: { title, ...result } });
    res.json({ ok: true, ...result });
  });

  // ---------------- ADMIN SYSTEM HEALTH, BACKUPS, CRON JOBS, AI LOGS & AUDIT ----------------

  app.get('/api/admin/system', requireSuperAdmin, (_req, res) => {
    const storage = getStorageHealth();
    const cronRuns = listRecentCronRuns(40);
    const auditLogs = listAdminAuditLogs(60);
    const aiLogs = db.prepare('SELECT * FROM ai_usage_logs ORDER BY created_at DESC LIMIT 40').all();
    const emailLogs = db.prepare('SELECT * FROM email_logs ORDER BY created_at DESC LIMIT 40').all();

    res.json({
      storage,
      services: {
        geminiConfigured: isGeminiConfigured(),
        smtpConfigured: isSmtpConfigured(),
        ephemeralSessionSecret: isSessionSecretEphemeral(),
        cronSecretConfigured: Boolean(process.env.CRON_SECRET?.trim()),
      },
      availableJobs: ALL_JOB_NAMES,
      cronRuns,
      auditLogs,
      aiLogs,
      emailLogs,
    });
  });

  app.post('/api/admin/cron/:jobName/run', requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    const jobName = String(req.params.jobName || '').trim() as JobName;
    if (!ALL_JOB_NAMES.includes(jobName)) {
      res.status(404).json({ error: 'Unknown scheduled job.' });
      return;
    }
    const result = await runManagedJob(jobName, { triggerSource: 'admin', force: true });
    recordAdminAudit({ req, action: 'cron_manual_trigger', targetType: 'job', targetId: jobName, details: result });
    res.json({ ok: result.status !== 'failed', jobName, ...result });
  });

  app.post('/api/admin/emails/retry', requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    const result = await retryFailedEmails(20);
    recordAdminAudit({ req, action: 'email_retry_manual', targetType: 'email', details: result });
    res.json({ ok: true, ...result });
  });

  app.get('/api/admin/backups', requireSuperAdmin, (_req, res) => {
    res.json({ backups: listBackups(), storage: getStorageHealth() });
  });

  app.post('/api/admin/backups', requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const backup = await createVerifiedBackup('manual');
      recordAdminAudit({ req, action: 'backup_create', targetType: 'backup', targetId: backup.filename });
      res.status(201).json({ ok: true, backup });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Backup failed.' });
    }
  });

  app.get('/api/admin/backups/:filename/download', requireSuperAdmin, (req: AuthenticatedRequest, res) => {
    try {
      const full = resolveSafeBackupPath(String(req.params.filename || ''));
      if (!fs.existsSync(full)) {
        res.status(404).json({ error: 'Backup file not found.' });
        return;
      }
      recordAdminAudit({ req, action: 'backup_download', targetType: 'backup', targetId: path.basename(full) });
      res.download(full, path.basename(full));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid backup file.' });
    }
  });

  app.post('/api/admin/backups/:filename/restore', requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const result = await restoreFromVerifiedBackup(String(req.params.filename || ''));
      recordAdminAudit({ req, action: 'backup_restore', targetType: 'backup', targetId: result.restoredFrom, details: result });
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Restore failed.' });
    }
  });

  // ---------------- ADMIN CATEGORIES, CONTACTS, SUBSCRIBERS, SETTINGS, USERS ----------------

  app.post('/api/admin/categories', requireAdmin, (req, res) => {
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    if (!name) {
      res.status(400).json({ error: 'Category name is required.' });
      return;
    }
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const id = `cat-${slug}`;
    try {
      db.prepare('INSERT INTO categories (id, name, slug, description) VALUES (?, ?, ?, ?)').run(id, name, slug, description);
      res.status(201).json({ category: db.prepare('SELECT * FROM categories WHERE id = ?').get(id) });
    } catch {
      res.status(409).json({ error: 'Category already exists.' });
    }
  });

  app.delete('/api/admin/categories/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM categories WHERE id = ?').run(String(req.params.id || ''));
    res.json({ ok: true });
  });

  app.get('/api/admin/contacts', requireAdmin, (_req, res) => {
    const contacts = db.prepare('SELECT * FROM contacts ORDER BY created_at DESC LIMIT 200').all();
    res.json({ contacts });
  });

  app.patch('/api/admin/contacts/:id', requireAdmin, (req, res) => {
    const status = ['new', 'reviewed', 'resolved'].includes(req.body?.status) ? req.body.status : 'reviewed';
    db.prepare('UPDATE contacts SET status = ? WHERE id = ?').run(status, String(req.params.id || ''));
    res.json({ ok: true });
  });

  app.get('/api/admin/subscribers', requireAdmin, (_req, res) => {
    const subscribers = db.prepare('SELECT * FROM newsletter_subscribers ORDER BY created_at DESC LIMIT 500').all();
    res.json({ subscribers });
  });

  app.delete('/api/admin/subscribers/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM newsletter_subscribers WHERE id = ?').run(String(req.params.id || ''));
    res.json({ ok: true });
  });

  app.get('/api/admin/settings', requireAdmin, (_req, res) => {
    const rows = db.prepare('SELECT setting_key, setting_value FROM site_settings').all() as Array<{
      setting_key: string;
      setting_value: string;
    }>;
    // Never return VAPID private keys in settings read responses
    const settings = Object.fromEntries(
      rows
        .filter((r) => !r.setting_key.includes('private_key'))
        .map((r) => [r.setting_key, r.setting_value]),
    );
    res.json({ settings });
  });

  app.put('/api/admin/settings', requireSuperAdmin, (req: AuthenticatedRequest, res) => {
    const allowedKeys = [
      'publishing_mode',
      'rss_interval_minutes',
      'rss_auto_enabled',
      'ai_quality_checks',
      'epaper_auto_hour_ist',
      'digest_auto_hour_ist',
      'tagline_hi',
      'tagline_en',
      'admin_email',
    ];
    for (const k of allowedKeys) {
      if (req.body?.[k] !== undefined) {
        setSetting(k, String(req.body[k]));
      }
    }
    recordAdminAudit({ req, action: 'settings_update', targetType: 'site_settings', details: { keys: Object.keys(req.body || {}) } });
    res.json({ ok: true });
  });

  app.get('/api/admin/users', requireSuperAdmin, (_req, res) => {
    const users = db.prepare('SELECT id, name, email, role, created_at FROM admin_users ORDER BY created_at ASC').all();
    res.json({ users });
  });

  app.post('/api/admin/users', requireSuperAdmin, (req: AuthenticatedRequest, res) => {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = ['super_admin', 'admin', 'editor'].includes(req.body?.role) ? req.body.role : 'editor';
    const password = String(req.body?.password || '');

    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      res.status(400).json({ error: 'Name, valid email, and password (minimum 8 chars) required.' });
      return;
    }

    const { hash, salt } = hashPassword(password);
    const id = `adm-${crypto.randomUUID().slice(0, 8)}`;
    try {
      db.prepare(
        'INSERT INTO admin_users (id, name, email, role, password_hash, password_salt) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(id, name, email, role, hash, salt);
      recordAdminAudit({ req, action: 'admin_user_create', targetType: 'admin_user', targetId: id, details: { email, role } });
      res.status(201).json({ user: { id, name, email, role } });
    } catch {
      res.status(409).json({ error: 'An admin user with this email already exists.' });
    }
  });

  app.delete('/api/admin/users/:id', requireSuperAdmin, (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id || '');
    if (req.adminUser?.sub === id) {
      res.status(400).json({ error: 'Cannot remove your own active session account.' });
      return;
    }
    db.prepare('DELETE FROM admin_users WHERE id = ?').run(id);
    recordAdminAudit({ req, action: 'admin_user_delete', targetType: 'admin_user', targetId: id });
    res.json({ ok: true });
  });

  // ---------------- LEGACY GOOGLE SHEETS MIGRATION UTILITY ----------------

  app.post('/api/admin/migrate', requireSuperAdmin, (req: AuthenticatedRequest, res) => {
    const records = Array.isArray(req.body?.records) ? req.body.records : [];
    if (records.length === 0) {
      res.status(400).json({ error: 'No records provided for migration.' });
      return;
    }

    const categories = db.prepare('SELECT id, slug, name FROM categories').all() as Array<{
      id: string;
      slug: string;
      name: string;
    }>;
    const states = db.prepare('SELECT id, slug, name FROM states').all() as Array<{
      id: string;
      slug: string;
      name: string;
    }>;

    const existingUrls = new Set(
      (db.prepare("SELECT source_url FROM articles WHERE source_url != ''").all() as Array<{ source_url: string }>).map(
        (r) => r.source_url,
      ),
    );
    const existingTitles = (db.prepare('SELECT title FROM articles').all() as Array<{ title: string }>).map(
      (r) => r.title,
    );

    let imported = 0;
    let skipped = 0;
    const invalidRows: Array<{ row: number; reason: string; title?: string }> = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i] as Record<string, unknown>;
      const rowNum = i + 1;
      const title = String(row.title || row.headline || row.Title || '').trim();
      const summary = String(row.summary || row.description || row.Summary || '').trim();

      if (!title || title.length < 4) {
        invalidRows.push({ row: rowNum, reason: 'Missing or too short title/headline.' });
        continue;
      }
      if (!summary) {
        invalidRows.push({ row: rowNum, title, reason: 'Missing required summary/description.' });
        continue;
      }

      const sourceUrl = sanitizeSafeUrl(row.source_url || row.url || row.link || '');
      if (sourceUrl && existingUrls.has(sourceUrl)) {
        skipped++;
        continue;
      }
      if (existingTitles.some((t) => titleSimilarity(t, title) >= 0.85)) {
        skipped++;
        continue;
      }

      const rawCat = String(row.category || row.Category || 'national').trim().toLowerCase();
      const catMatch = categories.find((c) => c.slug === rawCat || c.name.toLowerCase() === rawCat);
      const rawState = String(row.state || row.State || '').trim().toLowerCase();
      const stateMatch = states.find((s) => s.slug === rawState || s.name.toLowerCase() === rawState);

      const rawDate = String(row.published_at || row.date || row.Date || '').trim();
      let pubIso = new Date().toISOString();
      if (rawDate) {
        const parsed = new Date(rawDate);
        if (Number.isNaN(parsed.getTime())) {
          invalidRows.push({ row: rowNum, title, reason: `Invalid date format "${rawDate}".` });
          continue;
        }
        pubIso = parsed.toISOString();
      }

      const lang = String(row.language || row.Language || 'en').toLowerCase().startsWith('hi') ? 'hi' : 'en';

      db.prepare(`
        INSERT INTO articles (
          id, title, slug, summary, content, image_url, source_name, source_url,
          author, language, category_id, state_id, status, featured, breaking, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 0, 0, ?)
      `).run(
        `art-${crypto.randomUUID().slice(0, 10)}`,
        title,
        createSlug(title),
        summary,
        String(row.content || row.body || summary).trim(),
        sanitizeSafeUrl(row.image_url || row.image || ''),
        String(row.source_name || row.source || 'Maheep Archive').trim(),
        sourceUrl,
        String(row.author || 'Maheep Editorial Archive').trim(),
        lang,
        catMatch?.id || 'cat-national',
        stateMatch?.id || null,
        pubIso,
      );

      if (sourceUrl) existingUrls.add(sourceUrl);
      existingTitles.push(title);
      imported++;
    }

    recordAdminAudit({ req, action: 'legacy_migration', targetType: 'articles', details: { imported, skipped, invalidCount: invalidRows.length } });
    res.json({ ok: true, imported, skipped, invalidCount: invalidRows.length, invalidRows });
  });
}
