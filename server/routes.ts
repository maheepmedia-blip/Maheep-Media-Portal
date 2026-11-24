import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response } from 'express';
import {
  type AuthenticatedRequest,
  hashPassword,
  isAdminSetupNeeded,
  requireAdmin,
  requireSuperAdmin,
  signToken,
  verifyPassword,
} from './auth.ts';
import { db, getSetting, setSetting, uploadsDir } from './db.ts';
import { checkRateLimit, sendAdminContactNotification } from './email.ts';
import { generateEditionForDate, renderEditionPrintableHtml } from './epaper.ts';
import { type AiAssistAction, runEditorialAiAssist } from './gemini.ts';
import {
  createSlug,
  fetchAndParseFeed,
  runAllEnabledRssSources,
  runSingleRssSource,
  startRssScheduler,
  titleSimilarity,
  validateExternalFeedUrl,
} from './rss.ts';

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

function getTodayIndiaDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const ARTICLE_SELECT = `
  SELECT a.*, c.name as category_name, c.slug as category_slug,
         s.name as state_name, s.slug as state_slug, s.type as state_type, s.code as state_code
  FROM articles a
  LEFT JOIN categories c ON c.id = a.category_id
  LEFT JOIN states s ON s.id = a.state_id
`;

export function registerApiRoutes(app: Express): void {
  // ---------------- PUBLIC API ----------------

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, portal: 'Maheep News Portal', timezone: 'Asia/Kolkata' });
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
      .all(...langParams);

    const latest = db
      .prepare(`${ARTICLE_SELECT} WHERE a.status = 'published'${langClause} ORDER BY a.published_at DESC LIMIT 24`)
      .all(...langParams);

    const trending = db
      .prepare(`${ARTICLE_SELECT} WHERE a.status = 'published'${langClause} ORDER BY a.views DESC, a.published_at DESC LIMIT 6`)
      .all(...langParams);

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

    res.json({
      breaking,
      featured,
      latest,
      trending,
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
    if (state && state !== 'all') {
      conditions.push('s.slug = ?');
      params.push(state);
    }
    if (language === 'en' || language === 'hi') {
      conditions.push('a.language = ?');
      params.push(language);
    }
    if (date) {
      conditions.push('date(a.published_at) = date(?)');
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

    const related = db
      .prepare(`
        ${ARTICLE_SELECT}
        WHERE a.status = 'published' AND a.id != ? AND (a.category_id = ? OR a.state_id = ?)
        ORDER BY a.published_at DESC LIMIT 4
      `)
      .all(article.id, article.category_id, article.state_id);

    res.json({ article, related });
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

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderEditionPrintableHtml(edition));
  });

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

  app.post('/api/newsletter', (req, res) => {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`newsletter:${ip}`, 8, 10 * 60_000)) {
      res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
      return;
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const existing = db.prepare('SELECT id, status FROM newsletter_subscribers WHERE email = ?').get(email) as
      | { id: string; status: string }
      | undefined;

    if (existing) {
      db.prepare("UPDATE newsletter_subscribers SET status = 'active' WHERE id = ?").run(existing.id);
      res.json({ ok: true, message: 'You are subscribed to the Maheep Daily Briefing.' });
      return;
    }

    db.prepare('INSERT INTO newsletter_subscribers (id, email, status) VALUES (?, ?, ?)').run(
      `sub-${crypto.randomUUID().slice(0, 8)}`,
      email,
      'active',
    );
    res.status(201).json({ ok: true, message: 'Subscribed successfully to Maheep Daily Briefing.' });
  });

  // Static/Dynamic Sitemap XML
  app.get('/sitemap.xml', (req, res) => {
    const baseUrl = process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
      ? process.env.APP_URL.replace(/\/$/, '')
      : `${req.protocol}://${req.get('host')}`;

    const articles = db
      .prepare("SELECT slug, updated_at FROM articles WHERE status = 'published' ORDER BY published_at DESC LIMIT 500")
      .all() as Array<{ slug: string; updated_at: string }>;

    const staticRoutes = ['', '/national', '/states', '/business-sports', '/epaper', '/contact', '/search'];
    const urls = [
      ...staticRoutes.map((r) => `<url><loc>${baseUrl}${r}</loc><changefreq>hourly</changefreq></url>`),
      ...articles.map(
        (a) =>
          `<url><loc>${baseUrl}/news/${encodeURIComponent(a.slug)}</loc><lastmod>${new Date(a.updated_at).toISOString()}</lastmod></url>`,
      ),
    ];

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
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

  // One-time atomic first-run admin claim (locks forever once claimed)
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
          SUM(CASE WHEN date(published_at) = date(?) THEN 1 ELSE 0 END) as todaysArticles
        FROM articles
      `)
      .get(getTodayIndiaDate());

    const editions = (db.prepare('SELECT COUNT(*) as total FROM editions').get() as { total: number }).total;
    const contactsNew = (db.prepare("SELECT COUNT(*) as total FROM contacts WHERE status = 'new'").get() as { total: number }).total;
    const subscribers = (db.prepare("SELECT COUNT(*) as total FROM newsletter_subscribers WHERE status = 'active'").get() as { total: number }).total;
    const rssSources = db.prepare('SELECT id, name, enabled, last_fetched_at, last_error, imported_count FROM rss_sources').all();
    const recentLogs = db.prepare('SELECT * FROM rss_import_logs ORDER BY ran_at DESC LIMIT 12').all();

    res.json({
      stats,
      editions,
      contactsNew,
      subscribers,
      rssSources,
      recentLogs,
      scheduling: {
        lastRunAt: getSetting('rss_last_run_at', ''),
        nextRunAt: getSetting('rss_next_run_at', ''),
        intervalMinutes: Number(getSetting('rss_interval_minutes', '60')),
        publishingMode: getSetting('publishing_mode', 'manual_approval'),
      },
    });
  });

  // ---------------- ADMIN ARTICLES CRUD ----------------

  app.get('/api/admin/articles', requireAdmin, (req, res) => {
    const status = String(req.query.status || '').trim();
    const language = String(req.query.language || '').trim();
    const category = String(req.query.category || '').trim();
    const q = String(req.query.q || '').trim();

    const conditions = ['1=1'];
    const params: unknown[] = [];

    if (status && status !== 'all') {
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

  app.post('/api/admin/articles', requireAdmin, (req, res) => {
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
    const language = req.body?.language === 'hi' ? 'hi' : 'en';
    const id = `art-${crypto.randomUUID().slice(0, 10)}`;
    const slug = createSlug(title);
    const publishedAt = status === 'published' ? new Date().toISOString() : null;

    db.prepare(`
      INSERT INTO articles (
        id, title, slug, summary, content, image_url, source_name, source_url,
        author, language, category_id, state_id, subtopic, status, featured, breaking,
        ai_assisted, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    );

    const created = db.prepare(`${ARTICLE_SELECT} WHERE a.id = ?`).get(id);
    res.status(201).json({ article: created });
  });

  app.patch('/api/admin/articles/:id', requireAdmin, (req, res) => {
    const id = String(req.params.id || '');
    const existing = db.prepare('SELECT * FROM articles WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Article not found.' });
      return;
    }

    const nextStatus = ['draft', 'pending', 'published', 'archived'].includes(req.body?.status)
      ? req.body.status
      : existing.status;

    const publishedAt =
      nextStatus === 'published' && !existing.published_at ? new Date().toISOString() : existing.published_at;

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
      publishedAt,
      id,
    );

    const updated = db.prepare(`${ARTICLE_SELECT} WHERE a.id = ?`).get(id);
    res.json({ article: updated });
  });

  app.delete('/api/admin/articles/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM articles WHERE id = ?').run(String(req.params.id || ''));
    res.json({ ok: true });
  });

  app.post('/api/admin/articles/bulk', requireAdmin, (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    const action = String(req.body?.action || '');
    if (ids.length === 0) {
      res.status(400).json({ error: 'No articles selected.' });
      return;
    }

    const tx = db.transaction((targetIds: string[]) => {
      for (const id of targetIds) {
        if (action === 'publish') {
          db.prepare("UPDATE articles SET status = 'published', published_at = COALESCE(published_at, datetime('now')), updated_at = datetime('now') WHERE id = ?").run(id);
        } else if (action === 'unpublish') {
          db.prepare("UPDATE articles SET status = 'draft', updated_at = datetime('now') WHERE id = ?").run(id);
        } else if (action === 'delete') {
          db.prepare('DELETE FROM articles WHERE id = ?').run(id);
        }
      }
    });
    tx(ids);
    res.json({ ok: true, affected: ids.length });
  });

  // Safe image upload (base64 data URI up to 3MB)
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

  app.post('/api/ai/assist', requireAdmin, async (req, res) => {
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
        summary: String(req.body?.summary || ''),
        content: String(req.body?.content || ''),
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

  app.post('/api/admin/rss', requireAdmin, (req, res) => {
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

  app.delete('/api/admin/rss/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM rss_sources WHERE id = ?').run(String(req.params.id || ''));
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

  app.post('/api/admin/editions/generate', requireAdmin, (req, res) => {
    const dateStr = String(req.body?.edition_date || getTodayIndiaDate()).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      res.status(400).json({ error: 'Invalid edition date (YYYY-MM-DD required).' });
      return;
    }
    const edition = generateEditionForDate(dateStr);
    res.status(201).json({ edition });
  });

  app.delete('/api/admin/editions/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM editions WHERE id = ?').run(String(req.params.id || ''));
    res.json({ ok: true });
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
    const settings = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
    res.json({ settings });
  });

  app.put('/api/admin/settings', requireAdmin, (req, res) => {
    const allowedKeys = [
      'publishing_mode',
      'rss_interval_minutes',
      'rss_auto_enabled',
      'ai_quality_checks',
      'tagline_hi',
      'tagline_en',
      'admin_email',
    ];
    for (const k of allowedKeys) {
      if (req.body?.[k] !== undefined) {
        setSetting(k, String(req.body[k]));
      }
    }
    startRssScheduler();
    res.json({ ok: true });
  });

  app.get('/api/admin/users', requireSuperAdmin, (_req, res) => {
    const users = db.prepare('SELECT id, name, email, role, created_at FROM admin_users ORDER BY created_at ASC').all();
    res.json({ users });
  });

  app.post('/api/admin/users', requireSuperAdmin, (req, res) => {
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
    res.json({ ok: true });
  });

  // ---------------- LEGACY GOOGLE SHEETS MIGRATION UTILITY ----------------

  app.post('/api/admin/migrate', requireAdmin, (req, res) => {
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

    res.json({ ok: true, imported, skipped, invalidCount: invalidRows.length, invalidRows });
  });
}
