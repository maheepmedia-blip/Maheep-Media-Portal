import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(
  process.env.DATA_DIR?.trim() || process.env.RENDER_DISK_PATH?.trim() || path.join(process.cwd(), 'data'),
);
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const RESOLVED_DB_PATH = process.env.DB_PATH?.trim()
  ? path.resolve(process.env.DB_PATH.trim())
  : path.join(DATA_DIR, 'maheep.db');

for (const dir of [DATA_DIR, UPLOADS_DIR, BACKUPS_DIR, path.dirname(RESOLVED_DB_PATH)]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export const dataDir = DATA_DIR;
export const dbPath = RESOLVED_DB_PATH;
export const uploadsDir = UPLOADS_DIR;
export const backupsDir = BACKUPS_DIR;

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

function ensureColumn(table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS states (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (type IN ('state', 'ut')),
      code TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      summary TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      image_url TEXT DEFAULT '',
      source_name TEXT NOT NULL DEFAULT 'Maheep News Desk',
      source_url TEXT DEFAULT '',
      author TEXT NOT NULL DEFAULT 'Editorial Desk',
      language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'hi')),
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      state_id TEXT REFERENCES states(id) ON DELETE SET NULL,
      subtopic TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'published', 'archived')),
      featured INTEGER NOT NULL DEFAULT 0,
      breaking INTEGER NOT NULL DEFAULT 0,
      ai_assisted INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_articles_status_pub ON articles(status, published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category_id);
    CREATE INDEX IF NOT EXISTS idx_articles_state ON articles(state_id);
    CREATE INDEX IF NOT EXISTS idx_articles_language ON articles(language);
    CREATE INDEX IF NOT EXISTS idx_articles_source_url ON articles(source_url);

    CREATE TABLE IF NOT EXISTS editions (
      id TEXT PRIMARY KEY,
      edition_date TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      pdf_url TEXT DEFAULT '',
      cover_image TEXT DEFAULT '',
      page_count INTEGER NOT NULL DEFAULT 1,
      article_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
      content_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rss_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      feed_url TEXT NOT NULL UNIQUE,
      language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'hi')),
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_fetched_at TEXT,
      last_error TEXT DEFAULT '',
      imported_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rss_import_logs (
      id TEXT PRIMARY KEY,
      source_id TEXT REFERENCES rss_sources(id) ON DELETE CASCADE,
      source_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
      imported INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      message TEXT DEFAULT '',
      ran_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('super_admin', 'admin', 'editor')),
      password_hash TEXT DEFAULT '',
      password_salt TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT DEFAULT '',
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      inquiry_type TEXT NOT NULL DEFAULT 'general',
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved')),
      email_sent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      id TEXT PRIMARY KEY,
      setting_key TEXT NOT NULL UNIQUE,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      advertiser TEXT NOT NULL DEFAULT '',
      placement TEXT NOT NULL CHECK (placement IN ('header_banner', 'homepage_mid', 'sidebar', 'article_inline', 'epaper_banner')),
      image_url TEXT DEFAULT '',
      target_url TEXT DEFAULT '',
      description TEXT DEFAULT '',
      cta_text TEXT NOT NULL DEFAULT 'Learn More',
      language TEXT NOT NULL DEFAULT 'all' CHECK (language IN ('all', 'en', 'hi')),
      active INTEGER NOT NULL DEFAULT 1,
      start_date TEXT DEFAULT '',
      end_date TEXT DEFAULT '',
      impressions INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ads_placement_active ON ads(placement, active);

    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT DEFAULT '',
      actor_email TEXT DEFAULT '',
      actor_role TEXT DEFAULT '',
      action TEXT NOT NULL,
      target_type TEXT DEFAULT '',
      target_id TEXT DEFAULT '',
      details_json TEXT DEFAULT '{}',
      ip TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_logs(created_at DESC);

    CREATE TABLE IF NOT EXISTS cron_job_runs (
      id TEXT PRIMARY KEY,
      job_name TEXT NOT NULL,
      idempotency_key TEXT DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'skipped')),
      trigger_source TEXT NOT NULL DEFAULT 'internal',
      summary TEXT DEFAULT '',
      error_message TEXT DEFAULT '',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_cron_runs_job ON cron_job_runs(job_name, started_at DESC);

    CREATE TABLE IF NOT EXISTS job_locks (
      job_name TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      locked_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS article_revisions (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      editor_email TEXT NOT NULL DEFAULT 'editorial@maheepnews.in',
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      change_note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_revisions_article ON article_revisions(article_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS ai_usage_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      article_id TEXT DEFAULT '',
      actor_email TEXT DEFAULT 'system',
      model TEXT NOT NULL DEFAULT 'gemini-4-hydrogen',
      status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
      latency_ms INTEGER NOT NULL DEFAULT 0,
      input_chars INTEGER NOT NULL DEFAULT 0,
      output_chars INTEGER NOT NULL DEFAULT 0,
      result_summary TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ai_logs_created ON ai_usage_logs(created_at DESC);

    CREATE TABLE IF NOT EXISTS email_logs (
      id TEXT PRIMARY KEY,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      template_type TEXT NOT NULL DEFAULT 'general',
      status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
      error_message TEXT DEFAULT '',
      retries INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sent_at TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS reader_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      preferred_language TEXT NOT NULL DEFAULT 'all' CHECK (preferred_language IN ('all', 'en', 'hi')),
      font_size TEXT NOT NULL DEFAULT 'md' CHECK (font_size IN ('sm', 'md', 'lg')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reader_bookmarks (
      id TEXT PRIMARY KEY,
      reader_id TEXT NOT NULL REFERENCES reader_users(id) ON DELETE CASCADE,
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(reader_id, article_id)
    );

    CREATE TABLE IF NOT EXISTS reader_history (
      id TEXT PRIMARY KEY,
      reader_id TEXT NOT NULL REFERENCES reader_users(id) ON DELETE CASCADE,
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      read_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(reader_id, article_id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      reader_id TEXT DEFAULT '',
      author_name TEXT NOT NULL,
      author_email TEXT DEFAULT '',
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_comments_article_status ON comments(article_id, status, created_at DESC);

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'all',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL DEFAULT 'page_view',
      path TEXT NOT NULL DEFAULT '/',
      article_id TEXT DEFAULT '',
      category_slug TEXT DEFAULT '',
      language TEXT DEFAULT 'all',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_analytics_article ON analytics_events(article_id);

    CREATE TABLE IF NOT EXISTS authors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      role_title TEXT NOT NULL DEFAULT 'Correspondent',
      beat TEXT NOT NULL DEFAULT 'National Desk',
      bio TEXT NOT NULL DEFAULT '',
      email TEXT DEFAULT '',
      twitter_handle TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS social_posts (
      id TEXT PRIMARY KEY,
      article_id TEXT DEFAULT '',
      platform TEXT NOT NULL CHECK (platform IN ('x', 'whatsapp', 'facebook', 'linkedin', 'telegram')),
      message TEXT NOT NULL,
      share_url TEXT NOT NULL DEFAULT '',
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'ready', 'posted', 'cancelled')),
      posted_at TEXT DEFAULT NULL,
      created_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_social_posts_sched ON social_posts(status, scheduled_at);

    CREATE TABLE IF NOT EXISTS newsletter_campaigns (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      intro_text TEXT NOT NULL DEFAULT '',
      language TEXT NOT NULL DEFAULT 'all' CHECK (language IN ('all', 'en', 'hi')),
      article_ids_json TEXT NOT NULL DEFAULT '[]',
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'sent',
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_errors (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'api',
      route TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      stack_summary TEXT DEFAULT '',
      resolved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_system_errors_created ON system_errors(resolved, created_at DESC);

    CREATE TABLE IF NOT EXISTS reader_follows (
      id TEXT PRIMARY KEY,
      reader_id TEXT NOT NULL REFERENCES reader_users(id) ON DELETE CASCADE,
      follow_type TEXT NOT NULL CHECK (follow_type IN ('category', 'state', 'author')),
      target_slug TEXT NOT NULL,
      target_label TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(reader_id, follow_type, target_slug)
    );

    CREATE TABLE IF NOT EXISTS reader_epaper_bookmarks (
      id TEXT PRIMARY KEY,
      reader_id TEXT NOT NULL REFERENCES reader_users(id) ON DELETE CASCADE,
      edition_date TEXT NOT NULL,
      page_number INTEGER NOT NULL DEFAULT 1,
      section_title TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(reader_id, edition_date, page_number)
    );

    CREATE TABLE IF NOT EXISTS polls (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'National',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS poll_options (
      id TEXT PRIMARY KEY,
      poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      votes INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS poll_votes (
      id TEXT PRIMARY KEY,
      poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      voter_key TEXT NOT NULL,
      option_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(poll_id, voter_key)
    );

    CREATE TABLE IF NOT EXISTS news_timelines (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      summary TEXT NOT NULL DEFAULT '',
      topic_tag TEXT NOT NULL DEFAULT 'National',
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS timeline_events (
      id TEXT PRIMARY KEY,
      timeline_id TEXT NOT NULL REFERENCES news_timelines(id) ON DELETE CASCADE,
      event_date TEXT NOT NULL,
      headline TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      source_name TEXT NOT NULL DEFAULT 'Maheep Editorial Desk',
      source_url TEXT DEFAULT '',
      article_id TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS election_updates (
      id TEXT PRIMARY KEY,
      region_title TEXT NOT NULL,
      phase_label TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Scheduled / Official Tracker',
      turnout_pct REAL NOT NULL DEFAULT 0,
      total_seats INTEGER NOT NULL DEFAULT 0,
      leading_parties_json TEXT NOT NULL DEFAULT '[]',
      source_name TEXT NOT NULL DEFAULT 'Election Commission of India',
      source_url TEXT DEFAULT 'https://eci.gov.in',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Non-destructive column upgrades for existing production SQLite databases
  ensureColumn('articles', 'scheduled_at', 'TEXT DEFAULT NULL');
  ensureColumn('articles', 'unpublish_at', 'TEXT DEFAULT NULL');
  ensureColumn('articles', 'reviewed_by', "TEXT DEFAULT ''");
  ensureColumn('articles', 'reviewed_at', 'TEXT DEFAULT NULL');
  ensureColumn('articles', 'ai_audit_json', "TEXT DEFAULT '{}'");
  ensureColumn('articles', 'breaking_candidate', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('articles', 'preview_token', "TEXT DEFAULT ''");
  ensureColumn('articles', 'image_rights', "TEXT DEFAULT 'Editorial Attribution'");

  ensureColumn('reader_users', 'streak_days', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('reader_users', 'last_read_date', "TEXT DEFAULT ''");
  ensureColumn('reader_users', 'last_epaper_edition', "TEXT DEFAULT ''");
  ensureColumn('reader_users', 'last_epaper_page', 'INTEGER NOT NULL DEFAULT 1');

  ensureColumn('newsletter_subscribers', 'confirmed', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('newsletter_subscribers', 'confirm_token', "TEXT DEFAULT ''");
  ensureColumn('newsletter_subscribers', 'unsubscribe_token', "TEXT DEFAULT ''");
  ensureColumn('newsletter_subscribers', 'language_pref', "TEXT NOT NULL DEFAULT 'all'");
  ensureColumn('newsletter_subscribers', 'digest_frequency', "TEXT NOT NULL DEFAULT 'daily'");

  db.exec('CREATE INDEX IF NOT EXISTS idx_articles_scheduled ON articles(scheduled_at, unpublish_at)');

  seedInitialData();
}

function getIndiaDateOffset(daysAgo = 0): string {
  const target = new Date(Date.now() - daysAgo * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(target);
}

function seedInitialData(): void {
  const catCount = (db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number }).count;
  if (catCount === 0) {
    const insertCat = db.prepare('INSERT INTO categories (id, name, slug, description) VALUES (?, ?, ?, ?)');
    const categories = [
      ['cat-national', 'National', 'national', 'National headlines, Parliament, Government policy, Defence, Infrastructure, and Courts.'],
      ['cat-international', 'International', 'international', 'Global affairs, diplomacy, trade, and world developments.'],
      ['cat-state', 'State', 'state', 'Regional dispatches from all 28 Indian states and 8 Union Territories.'],
      ['cat-business', 'Business', 'business', 'Indian economy, markets, banking, startups, industry, and personal finance.'],
      ['cat-sports', 'Sports', 'sports', 'Cricket, football, hockey, badminton, tennis, and national athletics.'],
      ['cat-technology', 'Technology', 'technology', 'Digital public infrastructure, AI, semiconductors, cybersecurity, and telecom.'],
      ['cat-education', 'Education', 'education', 'NEP reforms, board exams, universities, scholarships, and skill development.'],
      ['cat-science', 'Science', 'science', 'ISRO space missions, climate research, biotech, and innovation.'],
      ['cat-entertainment', 'Entertainment', 'entertainment', 'Indian cinema, literature, performing arts, and cultural festivals.'],
      ['cat-editorial', 'Editorial', 'editorial', 'Opinion columns and investigative features from the Maheep Editorial Desk.'],
    ];
    for (const c of categories) insertCat.run(...c);
  }

  const stateCount = (db.prepare('SELECT COUNT(*) as count FROM states').get() as { count: number }).count;
  if (stateCount === 0) {
    const insertState = db.prepare('INSERT INTO states (id, name, slug, type, code) VALUES (?, ?, ?, ?, ?)');
    const statesList: Array<[string, string, 'state' | 'ut', string]> = [
      ['Andhra Pradesh', 'andhra-pradesh', 'state', 'AP'],
      ['Arunachal Pradesh', 'arunachal-pradesh', 'state', 'AR'],
      ['Assam', 'assam', 'state', 'AS'],
      ['Bihar', 'bihar', 'state', 'BR'],
      ['Chhattisgarh', 'chhattisgarh', 'state', 'CG'],
      ['Goa', 'goa', 'state', 'GA'],
      ['Gujarat', 'gujarat', 'state', 'GJ'],
      ['Haryana', 'haryana', 'state', 'HR'],
      ['Himachal Pradesh', 'himachal-pradesh', 'state', 'HP'],
      ['Jharkhand', 'jharkhand', 'state', 'JH'],
      ['Karnataka', 'karnataka', 'state', 'KA'],
      ['Kerala', 'kerala', 'state', 'KL'],
      ['Madhya Pradesh', 'madhya-pradesh', 'state', 'MP'],
      ['Maharashtra', 'maharashtra', 'state', 'MH'],
      ['Manipur', 'manipur', 'state', 'MN'],
      ['Meghalaya', 'meghalaya', 'state', 'ML'],
      ['Mizoram', 'mizoram', 'state', 'MZ'],
      ['Nagaland', 'nagaland', 'state', 'NL'],
      ['Odisha', 'odisha', 'state', 'OD'],
      ['Punjab', 'punjab', 'state', 'PB'],
      ['Rajasthan', 'rajasthan', 'state', 'RJ'],
      ['Sikkim', 'sikkim', 'state', 'SK'],
      ['Tamil Nadu', 'tamil-nadu', 'state', 'TN'],
      ['Telangana', 'telangana', 'state', 'TG'],
      ['Tripura', 'tripura', 'state', 'TR'],
      ['Uttar Pradesh', 'uttar-pradesh', 'state', 'UP'],
      ['Uttarakhand', 'uttarakhand', 'state', 'UK'],
      ['West Bengal', 'west-bengal', 'state', 'WB'],
      ['Andaman and Nicobar Islands', 'andaman-and-nicobar-islands', 'ut', 'AN'],
      ['Chandigarh', 'chandigarh', 'ut', 'CH'],
      ['Dadra and Nagar Haveli and Daman and Diu', 'dadra-nagar-haveli-daman-diu', 'ut', 'DN'],
      ['Delhi', 'delhi', 'ut', 'DL'],
      ['Jammu and Kashmir', 'jammu-and-kashmir', 'ut', 'JK'],
      ['Ladakh', 'ladakh', 'ut', 'LA'],
      ['Lakshadweep', 'lakshadweep', 'ut', 'LD'],
      ['Puducherry', 'puducherry', 'ut', 'PY'],
    ];
    for (const [name, slug, type, code] of statesList) {
      insertState.run(`st-${code.toLowerCase()}`, name, slug, type, code);
    }
  }

  const rssCount = (db.prepare('SELECT COUNT(*) as count FROM rss_sources').get() as { count: number }).count;
  if (rssCount === 0) {
    const insertRss = db.prepare(
      'INSERT INTO rss_sources (id, name, feed_url, language, category_id, enabled) VALUES (?, ?, ?, ?, ?, ?)',
    );
    insertRss.run('rss-gnews-en', 'Google News India (English)', 'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en', 'en', 'cat-national', 1);
    insertRss.run('rss-gnews-hi', 'Google News India (Hindi)', 'https://news.google.com/rss?hl=hi&gl=IN&ceid=IN:hi', 'hi', 'cat-national', 1);
    insertRss.run('rss-gnews-biz', 'Google News India — Business', 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-IN&gl=IN&ceid=IN:en', 'en', 'cat-business', 1);
    insertRss.run('rss-gnews-sports', 'Google News India — Sports', 'https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en-IN&gl=IN&ceid=IN:en', 'en', 'cat-sports', 1);
    insertRss.run('rss-gnews-tech', 'Google News India — Technology', 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-IN&gl=IN&ceid=IN:en', 'en', 'cat-technology', 1);
    insertRss.run('rss-gnews-sci', 'Google News India — Science', 'https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en-IN&gl=IN&ceid=IN:en', 'en', 'cat-science', 1);
    insertRss.run('rss-pib-en', 'PIB India (English)', 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1', 'en', 'cat-national', 1);
    insertRss.run('rss-pib-hi', 'PIB India (Hindi)', 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=2&Regid=3', 'hi', 'cat-national', 1);
  }

  const settingsCount = (db.prepare('SELECT COUNT(*) as count FROM site_settings').get() as { count: number }).count;
  if (settingsCount === 0) {
    const insertSetting = db.prepare('INSERT INTO site_settings (id, setting_key, setting_value) VALUES (?, ?, ?)');
    const defaults: Array<[string, string]> = [
      ['publishing_mode', 'manual_approval'],
      ['rss_interval_minutes', '30'],
      ['rss_auto_enabled', 'true'],
      ['ai_quality_checks', 'true'],
      ['epaper_auto_hour_ist', '6'],
      ['digest_auto_hour_ist', '7'],
      ['tagline_hi', 'सच के साथ, जनता के विश्वास के साथ'],
      ['tagline_en', 'News from India & Beyond'],
      ['admin_email', 'maheepmedia@gmail.com'],
      ['rss_last_run_at', ''],
      ['rss_next_run_at', ''],
    ];
    for (const [k, v] of defaults) {
      insertSetting.run(`set-${k}`, k, v);
    }
  }

  const artCount = (db.prepare('SELECT COUNT(*) as count FROM articles').get() as { count: number }).count;
  if (artCount === 0) {
    const istTimestampOnDay = (daysAgo: number, hourIst: number) => {
      const dateStr = getIndiaDateOffset(daysAgo);
      const hh = String(hourIst).padStart(2, '0');
      return new Date(`${dateStr}T${hh}:15:00+05:30`).toISOString();
    };
    const imgParliament = '/src/assets/images/hero_parliament_india_1795494842593.jpg';
    const imgEconomy = '/src/assets/images/news_digital_economy_1795494842110.jpg';
    const imgSolar = '/src/assets/images/news_rural_solar_tech_1795494844202.jpg';
    const imgCampus = '/src/assets/images/news_education_campus_1795494845343.jpg';

    const seedArticles = [
      {
        id: 'art-1',
        title: 'Parliament Advances National Digital Public Infrastructure & Freight Corridor Bills in Winter Sitting',
        slug: 'parliament-advances-digital-infrastructure-freight-corridor-bills',
        summary: 'Lawmakers debate expanded rural broadband access, port-rail multimodal connectivity, and state-level fiscal grants aimed at accelerating regional manufacturing corridors.',
        content: 'NEW DELHI — Parliament took up key legislative proposals focused on expanding India’s multimodal logistics corridors and strengthening interoperable digital public infrastructure across Tier-2 and Tier-3 municipalities.\n\nSpeaking during the debate, policy planners emphasized integrated rail-port links and transparent municipal accounting frameworks designed to reduce freight turnaround times across industrial clusters.\n\nOpposition and treasury benches alike sought clear timelines for state-level implementation grants, rural fibre-optic maintenance, and green energy integration along dedicated freight routes.',
        image_url: imgParliament,
        source_name: 'Maheep National Bureau',
        source_url: '',
        author: 'Raghavendra Mishra',
        language: 'en',
        category_id: 'cat-national',
        state_id: 'st-dl',
        subtopic: 'Parliament & Policy',
        status: 'published',
        featured: 1,
        breaking: 1,
        views: 1840,
        published_at: istTimestampOnDay(0, 18),
      },
      {
        id: 'art-2',
        title: 'संसद में डिजिटल अवसंरचना और औद्योगिक गलियारे से जुड़े प्रमुख विधेयकों पर चर्चा तेज',
        slug: 'sansad-digital-infrastructure-industrial-corridor-discussion-hindi',
        summary: 'देश के टियर-2 और टियर-3 शहरों में तेज ब्रॉडबैंड विस्तार, रेलवे-बंदरगाह समन्वय और राज्यों के लिए वित्तीय अनुदान को लेकर संसद में व्यापक विचार-विमर्श हुआ।',
        content: 'नई दिल्ली — संसद के सत्र में देश के लॉजिस्टिक्स नेटवर्क को सुदृढ़ करने और ग्रामीण क्षेत्रों तक डिजिटल सेवाओं की पहुंच बढ़ाने से जुड़े प्रस्तावों पर विस्तृत चर्चा हुई।\n\nविशेषज्ञों का मानना है कि मल्टीमॉडल फ्रेट कॉरिडोर से कृषि उत्पादों और स्थानीय उद्योगों के माल परिवहन की लागत में उल्लेखनीय कमी आएगी।\n\nसदस्यों ने राज्यों के साथ समन्वय और पारदर्शी समय-सीमा तय करने की आवश्यकता पर बल दिया।',
        image_url: imgParliament,
        source_name: 'माहीप राष्ट्रीय ब्यूरो',
        source_url: '',
        author: 'अंजलि शर्मा',
        language: 'hi',
        category_id: 'cat-national',
        state_id: 'st-dl',
        subtopic: 'Parliament & Policy',
        status: 'published',
        featured: 1,
        breaking: 1,
        views: 1520,
        published_at: istTimestampOnDay(0, 16),
      },
      {
        id: 'art-3',
        title: 'RBI & Capital Markets Review Domestic Liquidity as Urban Metro Projects Expand Across Mumbai & Pune',
        slug: 'rbi-capital-markets-review-domestic-liquidity-mumbai-pune-metro',
        summary: 'Financial institutions report resilient retail participation and steady credit demand across infrastructure, renewable utilities, and MSME manufacturing units.',
        content: 'MUMBAI — Banking analysts and market participants noted sustained domestic institutional inflows as urban mass transit and industrial park investments gather pace across Maharashtra.\n\nMSME credit frameworks and digital payment rails continue to anchor formalization in regional supply chains, while treasury desks closely track global commodity trajectories.\n\nEconomists highlighted that disciplined fiscal allocation and urban transit expansion are improving commuter productivity across western commercial corridors.',
        image_url: imgEconomy,
        source_name: 'Maheep Business Desk',
        source_url: '',
        author: 'Siddharth Kulkarni',
        language: 'en',
        category_id: 'cat-business',
        state_id: 'st-mh',
        subtopic: 'Indian Economy & Markets',
        status: 'published',
        featured: 1,
        breaking: 0,
        views: 1190,
        published_at: istTimestampOnDay(0, 14),
      },
      {
        id: 'art-4',
        title: 'Rajasthan & Gujarat Solar Microgrids Deliver Daytime Clean Power to Rural Irrigation Clusters',
        slug: 'rajasthan-gujarat-solar-microgrids-rural-irrigation-clusters',
        summary: 'Decentralized solar feeders in arid districts are lowering agricultural pumping costs and stabilizing rural distribution utilities.',
        content: 'JAIPUR — Community-linked solar arrays across western Rajasthan and northern Gujarat are transforming daytime power reliability for smallholder farmers.\n\nState energy planners report that feeder-level solarization reduces transmission losses and eases peak evening demand on regional grids.\n\nLocal cooperatives have begun training rural technicians in panel diagnostics and battery storage maintenance.',
        image_url: imgSolar,
        source_name: 'Maheep Energy & States Desk',
        source_url: '',
        author: 'Meenakshi Rathore',
        language: 'en',
        category_id: 'cat-state',
        state_id: 'st-rj',
        subtopic: 'Clean Energy',
        status: 'published',
        featured: 1,
        breaking: 0,
        views: 980,
        published_at: istTimestampOnDay(0, 11),
      },
      {
        id: 'art-5',
        title: 'उत्तर प्रदेश और बिहार में कृषि आधारित फूड प्रोसेसिंग और सौर ऊर्जा परियोजनाओं को नई गति',
        slug: 'up-bihar-food-processing-solar-projects-hindi',
        summary: 'ग्रामीण क्षेत्रों में कोल्ड-चेन नेटवर्क और सौर पंप परियोजनाओं से किसानों की आमदनी और स्थानीय रोजगार के अवसर बढ़ रहे हैं।',
        content: 'लखनऊ / पटना — उत्तर प्रदेश और बिहार के प्रमुख कृषि जिलों में आधुनिक फूड प्रोसेसिंग क्लस्टर और सौर ऊर्जा इकाइयों का विस्तार किया जा रहा है।\n\nस्थानीय स्तर पर भंडारण और प्रसंस्करण सुविधाएं मिलने से फसल कटाई के बाद होने वाले नुकसान में कमी आ रही है।\n\nराज्य प्रशासन ने युवा उद्यमियों के लिए सरल ऋण और तकनीकी प्रशिक्षण शिविर शुरू किए हैं।',
        image_url: imgSolar,
        source_name: 'माहीप राज्य डेस्क',
        source_url: '',
        author: 'विवेक त्रिपाठी',
        language: 'hi',
        category_id: 'cat-state',
        state_id: 'st-up',
        subtopic: 'Agriculture & States',
        status: 'published',
        featured: 0,
        breaking: 1,
        views: 1110,
        published_at: istTimestampOnDay(0, 9),
      },
      {
        id: 'art-6',
        title: 'India’s Domestic Cricket & Badminton Calendar Sees Record Youth Participation Across Regional Academies',
        slug: 'india-domestic-cricket-badminton-youth-academies',
        summary: 'State sports associations expand turf wickets, floodlit training grounds, and sports science rehabilitation centres ahead of the national season.',
        content: 'BENGALURU — National selectors and state cricket associations are spotlighting deeper talent pipelines emerging from smaller towns across Karnataka, Punjab, Tamil Nadu, and Jharkhand.\n\nMeanwhile, badminton and hockey academies in Hyderabad, Bhubaneswar, and Chandigarh have introduced biomechanics analytics and nutrition support for junior athletes.\n\nSports administrators stressed that consistent district-level tournaments remain essential for discovering Olympic and international prospects.',
        image_url: '',
        source_name: 'Maheep Sports Desk',
        source_url: '',
        author: 'Arjun Nair',
        language: 'en',
        category_id: 'cat-sports',
        state_id: 'st-ka',
        subtopic: 'Cricket & Athletics',
        status: 'published',
        featured: 1,
        breaking: 0,
        views: 1340,
        published_at: istTimestampOnDay(0, 7),
      },
      {
        id: 'art-7',
        title: 'IITs and State Universities Launch Multilingual AI & Semiconductor Design Labs Under NEP Framework',
        slug: 'iits-state-universities-launch-ai-semiconductor-labs-nep',
        summary: 'Undergraduate engineering and science curricula incorporate hands-on chip verification, Indian-language computing, and industry apprenticeships.',
        content: 'CHENNAI — A consortium of state universities and premier technical institutes has unveiled shared semiconductor design workbenches and open-source Indian language research labs.\n\nFaculty coordinators noted that aligning academic credits with laboratory internships gives students from regional campuses direct exposure to hardware verification and applied research.\n\nScholarship portals for first-generation STEM learners have also been streamlined for the upcoming semester.',
        image_url: imgCampus,
        source_name: 'Maheep Education & Tech Desk',
        source_url: '',
        author: 'Dr. Kavita Subramanian',
        language: 'en',
        category_id: 'cat-education',
        state_id: 'st-tn',
        subtopic: 'Higher Education',
        status: 'published',
        featured: 0,
        breaking: 0,
        views: 870,
        published_at: istTimestampOnDay(1, 17),
      },
      {
        id: 'art-8',
        title: 'सेमीकंडक्टर और भारतीय भाषाओं में एआई शोध के लिए विश्वविद्यालयों में नए प्रयोगशाला केंद्र',
        slug: 'semiconductor-indian-language-ai-labs-universities-hindi',
        summary: 'राष्ट्रीय शिक्षा नीति के तहत इंजीनियरिंग और विज्ञान के छात्रों को चिप डिज़ाइन और बहुभाषी तकनीक का व्यावहारिक प्रशिक्षण मिलेगा।',
        content: 'नई दिल्ली — देश के प्रमुख तकनीकी संस्थानों और राज्य विश्वविद्यालयों में आधुनिक सेमीकंडक्टर डिज़ाइन और भारतीय भाषा प्रौद्योगिकी पर आधारित नई प्रयोगशालाएं स्थापित की जा रही हैं।\n\nइसका उद्देश्य छात्रों को केवल सैद्धांतिक ज्ञान के बजाय उद्योग से जुड़े वास्तविक शोध और नवाचार से जोड़ना है।\n\nशोधार्थियों के लिए छात्रवृत्ति और ओपन-एक्सेस डेटा सेट भी उपलब्ध कराए जाएंगे।',
        image_url: imgCampus,
        source_name: 'माहीप शिक्षा एवं विज्ञान डेस्क',
        source_url: '',
        author: 'प्रिया जोशी',
        language: 'hi',
        category_id: 'cat-technology',
        state_id: 'st-dl',
        subtopic: 'AI & Semiconductors',
        status: 'published',
        featured: 0,
        breaking: 0,
        views: 760,
        published_at: istTimestampOnDay(1, 15),
      },
      {
        id: 'art-9',
        title: 'ISRO Prepares Next-Generation Earth Observation Payload for Monsoon & Coastal Telemetry',
        slug: 'isro-earth-observation-payload-monsoon-coastal-telemetry',
        summary: 'High-resolution multispectral sensors will aid state disaster management agencies, crop yield estimation, and maritime weather forecasting.',
        content: 'THIRUVANANTHAPURAM — Space scientists completed thermal-vacuum integration tests on an advanced earth observation instrument tailored for real-time monsoon tracking and coastal cyclone preparedness.\n\nData products from the mission will be shared directly with agricultural universities and state meteorological centers in near real time.',
        image_url: imgSolar,
        source_name: 'Maheep Science Desk',
        source_url: '',
        author: 'Nikhil Menon',
        language: 'en',
        category_id: 'cat-science',
        state_id: 'st-kl',
        subtopic: 'Space & Climate',
        status: 'published',
        featured: 0,
        breaking: 0,
        views: 910,
        published_at: istTimestampOnDay(1, 13),
      },
      {
        id: 'art-10',
        title: 'Supreme Court Issues Guidelines on Expedited Digital Case Management in District Courts',
        slug: 'supreme-court-guidelines-digital-case-management-district-courts',
        summary: 'The judicial directive prioritizes bilingual e-filing access, standardized cause lists, and faster disposal of senior citizen petitions.',
        content: 'NEW DELHI — Emphasizing timely access to justice, the Supreme Court issued administrative directions encouraging High Courts and district judiciary units to adopt unified bilingual e-filing portals.\n\nBar associations welcomed support kiosks designed to assist litigants in rural subdivisions.',
        image_url: imgParliament,
        source_name: 'Maheep Legal Desk',
        source_url: '',
        author: 'Devika Sen',
        language: 'en',
        category_id: 'cat-national',
        state_id: 'st-dl',
        subtopic: 'Courts & Legal',
        status: 'published',
        featured: 0,
        breaking: 0,
        views: 830,
        published_at: istTimestampOnDay(1, 11),
      },
      {
        id: 'art-11',
        title: 'India & Global Trade Partners Expand Maritime Logistics and Critical Mineral Dialogues',
        slug: 'india-global-trade-partners-maritime-logistics-critical-minerals',
        summary: 'Diplomatic delegations reviewed resilient shipping corridors, digital customs clearance, and clean-tech mineral processing standards.',
        content: 'NEW DELHI — Senior trade envoys concluded bilateral working-group sessions focused on port digitalization, resilient supply chains, and joint standards for clean-energy minerals.\n\nAnalysts observe that India’s growing port capacity on both eastern and western coasts positions it as a pivotal transit hub.',
        image_url: imgEconomy,
        source_name: 'Maheep International Desk',
        source_url: '',
        author: 'Rohan Malhotra',
        language: 'en',
        category_id: 'cat-international',
        state_id: null,
        subtopic: 'Global Trade & Diplomacy',
        status: 'published',
        featured: 0,
        breaking: 0,
        views: 690,
        published_at: istTimestampOnDay(1, 9),
      },
      {
        id: 'art-12',
        title: 'West Bengal & Odisha Coastal Ports Record Steady Growth in Containerized Agricultural Exports',
        slug: 'west-bengal-odisha-coastal-ports-agricultural-exports',
        summary: 'Improved cold-storage berths at Haldia and Paradip are helping eastern producers ship marine and horticultural goods faster.',
        content: 'KOLKATA / BHUBANESWAR — Eastern port authorities reported measurable improvements in vessel turnaround times following automated customs scanning and expanded rail sidings.',
        image_url: imgEconomy,
        source_name: 'Maheep Eastern Bureau',
        source_url: '',
        author: 'Suhasini Chatterjee',
        language: 'en',
        category_id: 'cat-state',
        state_id: 'st-wb',
        subtopic: 'Ports & Trade',
        status: 'published',
        featured: 0,
        breaking: 0,
        views: 540,
        published_at: istTimestampOnDay(2, 18),
      },
      {
        id: 'art-13',
        title: 'Indian Regional Cinema & Literary Festivals Celebrate Restoration of Classic Archival Films',
        slug: 'indian-regional-cinema-literary-festivals-archival-restoration',
        summary: 'Curators across Pune, Kolkata, and Kochi showcase 4K restorations of landmark Hindi, Marathi, Bengali, and Malayalam cinema.',
        content: 'PUNE — Film archivists and literary festival organizers are drawing packed audiences to restored classics accompanied by bilingual subtitles and director retrospectives.',
        image_url: imgCampus,
        source_name: 'Maheep Culture Desk',
        source_url: '',
        author: 'Ananya Deshmukh',
        language: 'en',
        category_id: 'cat-entertainment',
        state_id: 'st-mh',
        subtopic: 'Cinema & Literature',
        status: 'published',
        featured: 0,
        breaking: 0,
        views: 495,
        published_at: istTimestampOnDay(2, 16),
      },
      {
        id: 'art-14',
        title: 'लद्दाख और हिमाचल प्रदेश में हरित पर्यटन व पर्वतीय सड़क सुरक्षा के नए मानक लागू',
        slug: 'ladakh-himachal-green-tourism-mountain-road-safety-hindi',
        summary: 'संवेदनशील हिमालयी क्षेत्रों में इलेक्ट्रिक शटल सेवा, अपशिष्ट प्रबंधन और मौसम चेतावनी प्रणाली को सशक्त किया जा रहा है।',
        content: 'लेह / शिमला — हिमालयी राज्यों और केंद्र शासित प्रदेशों में पर्यावरण के अनुकूल पर्यटन को बढ़ावा देने के लिए स्थानीय प्रशासन ने प्लास्टिक नियंत्रण और बेहतर सड़क सुरक्षा संकेतक स्थापित किए हैं।',
        image_url: imgSolar,
        source_name: 'माहीप हिमालय डेस्क',
        source_url: '',
        author: 'राजेश नेगी',
        language: 'hi',
        category_id: 'cat-state',
        state_id: 'st-la',
        subtopic: 'Infrastructure & Ecology',
        status: 'published',
        featured: 0,
        breaking: 0,
        views: 615,
        published_at: istTimestampOnDay(2, 14),
      },
      {
        id: 'art-15',
        title: 'Defence R&D Highlights Indigenous Radar, Drone Swarm Countermeasures & Border Connectivity',
        slug: 'defence-rd-indigenous-radar-drone-countermeasures-border-connectivity',
        summary: 'Public and private defence manufacturers test next-generation surveillance radars and all-weather high-altitude bridges.',
        content: 'NEW DELHI — Defence research agencies showcased field-tested counter-drone systems and modular bridge spans designed for rapid deployment in mountainous border terrain.',
        image_url: imgParliament,
        source_name: 'Maheep Defence Desk',
        source_url: '',
        author: 'Col. Vikramaditya Rao (Retd.)',
        language: 'en',
        category_id: 'cat-national',
        state_id: 'st-jk',
        subtopic: 'Defence',
        status: 'published',
        featured: 0,
        breaking: 0,
        views: 1050,
        published_at: istTimestampOnDay(2, 11),
      },
      {
        id: 'art-16',
        title: 'Personal Finance & UPI Auto-Pay Safeguards: What Small Savers Should Know This Quarter',
        slug: 'personal-finance-upi-autopay-safeguards-small-savers',
        summary: 'Consumer banking advisors outline simple steps for verifying recurring mandates, nominee updates, and sovereign bond yields.',
        content: 'MUMBAI — With digital recurring mandates growing rapidly, banking educators urge households to review monthly permissions and verify official grievance redressal channels.',
        image_url: imgEconomy,
        source_name: 'Maheep Finance Desk',
        source_url: '',
        author: 'Neha Bansal',
        language: 'en',
        category_id: 'cat-business',
        state_id: 'st-gj',
        subtopic: 'Personal Finance',
        status: 'published',
        featured: 0,
        breaking: 0,
        views: 740,
        published_at: istTimestampOnDay(2, 9),
      },
    ];

    const insertArticle = db.prepare(`
      INSERT INTO articles (
        id, title, slug, summary, content, image_url, source_name, source_url,
        author, language, category_id, state_id, subtopic, status, featured, breaking,
        ai_assisted, views, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `);

    for (const a of seedArticles) {
      insertArticle.run(
        a.id,
        a.title,
        a.slug,
        a.summary,
        a.content,
        a.image_url,
        a.source_name,
        a.source_url,
        a.author,
        a.language,
        a.category_id,
        a.state_id,
        a.subtopic,
        a.status,
        a.featured,
        a.breaking,
        a.views,
        a.published_at,
      );
    }
  }

  const editionCount = (db.prepare('SELECT COUNT(*) as count FROM editions').get() as { count: number }).count;
  if (editionCount === 0) {
    const insertEd = db.prepare(`
      INSERT INTO editions (id, edition_date, title, pdf_url, cover_image, page_count, article_count, status, content_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?)
    `);

    for (let d = 0; d < 3; d++) {
      const dateStr = getIndiaDateOffset(d);
      const dayArticles = db
        .prepare(`
          SELECT a.id, a.title, a.slug, a.summary, a.content, a.image_url, a.image_rights, a.source_name, a.source_url, a.author, a.language, a.subtopic, a.views, a.published_at,
                 c.name as category_name, c.slug as category_slug, s.name as state_name
          FROM articles a
          LEFT JOIN categories c ON c.id = a.category_id
          LEFT JOIN states s ON s.id = a.state_id
          WHERE a.status = 'published'
            AND date(datetime(a.published_at, '+5 hours', '+30 minutes')) = date(?)
          ORDER BY CASE WHEN a.source_url != '' THEN 0 ELSE 1 END, a.featured DESC, a.published_at DESC
          LIMIT 40
        `)
        .all(dateStr) as Array<Record<string, unknown>>;

      if (dayArticles.length === 0) continue;
      const id = `ed-${dateStr}`;
      const pages = buildEditionPagesPayload(dateStr, dayArticles);
      const cover = String(
        dayArticles.find((a) => Boolean(a.image_url))?.image_url ||
          '/src/assets/images/hero_parliament_india_1795494842593.jpg',
      );
      insertEd.run(
        id,
        dateStr,
        d === 0 ? `Maheep Daily Digital Edition — ${dateStr}` : `Maheep Archive Edition — ${dateStr}`,
        `/api/editions/${id}/html`,
        cover,
        pages.length,
        dayArticles.length,
        JSON.stringify({ pages }),
      );
    }
  }

  // One-time migration for existing databases where seeded sample articles all shared one day
  if (getSetting('epaper_date_distinct_v1', '') !== 'done') {
    const dayMap: Array<{ ids: string[]; daysAgo: number }> = [
      { ids: ['art-1', 'art-2', 'art-3', 'art-4', 'art-5', 'art-6'], daysAgo: 0 },
      { ids: ['art-7', 'art-8', 'art-9', 'art-10', 'art-11'], daysAgo: 1 },
      { ids: ['art-12', 'art-13', 'art-14', 'art-15', 'art-16'], daysAgo: 2 },
    ];
    for (const group of dayMap) {
      const targetDate = getIndiaDateOffset(group.daysAgo);
      group.ids.forEach((artId, idx) => {
        const hh = String(18 - idx * 2).padStart(2, '0');
        const iso = new Date(`${targetDate}T${hh}:15:00+05:30`).toISOString();
        db.prepare('UPDATE articles SET published_at = ? WHERE id = ?').run(iso, artId);
      });
    }
    for (let d = 0; d < 3; d++) {
      const dateStr = getIndiaDateOffset(d);
      const edId = `ed-${dateStr}`;
      const existingEd = db.prepare('SELECT id FROM editions WHERE id = ?').get(edId);
      if (existingEd) {
        const dayArticles = db
          .prepare(`
            SELECT a.id, a.title, a.slug, a.summary, a.image_url, a.source_name, a.author, a.language, a.published_at,
                   c.name as category_name, c.slug as category_slug, s.name as state_name
            FROM articles a
            LEFT JOIN categories c ON c.id = a.category_id
            LEFT JOIN states s ON s.id = a.state_id
            WHERE a.status = 'published'
              AND date(datetime(a.published_at, '+5 hours', '+30 minutes')) = date(?)
            ORDER BY a.featured DESC, a.published_at DESC
          `)
          .all(dateStr) as Array<Record<string, unknown>>;
        if (dayArticles.length > 0) {
          const pages = buildEditionPagesPayload(dateStr, dayArticles);
          const cover = String(
            dayArticles.find((a) => Boolean(a.image_url))?.image_url ||
              '/src/assets/images/hero_parliament_india_1795494842593.jpg',
          );
          db.prepare(
            'UPDATE editions SET cover_image = ?, page_count = ?, article_count = ?, content_json = ? WHERE id = ?',
          ).run(cover, pages.length, dayArticles.length, JSON.stringify({ pages }), edId);
        }
      }
    }
    setSetting('epaper_date_distinct_v1', 'done');
  }

  // Re-sync all existing editions by strict IST date and remove stale cloned editions with 0 articles on that date
  if (getSetting('epaper_date_cleanup_v2', '') !== 'done') {
    const existingEditions = db
      .prepare('SELECT id, edition_date FROM editions')
      .all() as Array<{ id: string; edition_date: string }>;

    const findDayArticles = db.prepare(`
      SELECT a.id, a.title, a.slug, a.summary, a.image_url, a.source_name, a.author, a.language, a.published_at,
             c.name as category_name, c.slug as category_slug, s.name as state_name
      FROM articles a
      LEFT JOIN categories c ON c.id = a.category_id
      LEFT JOIN states s ON s.id = a.state_id
      WHERE a.status = 'published'
        AND date(datetime(a.published_at, '+5 hours', '+30 minutes')) = date(?)
      ORDER BY a.featured DESC, a.breaking DESC, a.published_at DESC
      LIMIT 30
    `);

    const updateEdition = db.prepare(
      'UPDATE editions SET cover_image = ?, page_count = ?, article_count = ?, content_json = ? WHERE id = ?',
    );
    const deleteEdition = db.prepare('DELETE FROM editions WHERE id = ?');

    for (const ed of existingEditions) {
      const dayArticles = findDayArticles.all(ed.edition_date) as Array<Record<string, unknown>>;
      if (dayArticles.length > 0) {
        const pages = buildEditionPagesPayload(ed.edition_date, dayArticles);
        const cover = String(
          dayArticles.find((a) => Boolean(a.image_url))?.image_url ||
            '/src/assets/images/hero_parliament_india_1795494842593.jpg',
        );
        updateEdition.run(cover, pages.length, dayArticles.length, JSON.stringify({ pages }), ed.id);
      } else {
        deleteEdition.run(ed.id);
      }
    }
    setSetting('epaper_date_cleanup_v2', 'done');
  }

  // Rebuild existing editions with deduplicated section pages and real-news-first ordering
  if (getSetting('epaper_date_cleanup_v3', '') !== 'done') {
    const existingEditions = db
      .prepare('SELECT id, edition_date FROM editions')
      .all() as Array<{ id: string; edition_date: string }>;

    const findDayArticles = db.prepare(`
      SELECT a.id, a.title, a.slug, a.summary, a.image_url, a.source_name, a.author, a.language, a.published_at,
             c.name as category_name, c.slug as category_slug, s.name as state_name
      FROM articles a
      LEFT JOIN categories c ON c.id = a.category_id
      LEFT JOIN states s ON s.id = a.state_id
      WHERE a.status = 'published'
        AND date(datetime(a.published_at, '+5 hours', '+30 minutes')) = date(?)
      ORDER BY CASE WHEN a.source_url != '' THEN 0 ELSE 1 END, a.published_at DESC, a.featured DESC, a.breaking DESC
      LIMIT 30
    `);

    const updateEdition = db.prepare(
      'UPDATE editions SET cover_image = ?, page_count = ?, article_count = ?, content_json = ? WHERE id = ?',
    );
    const deleteEdition = db.prepare('DELETE FROM editions WHERE id = ?');

    for (const ed of existingEditions) {
      const dayArticles = findDayArticles.all(ed.edition_date) as Array<Record<string, unknown>>;
      if (dayArticles.length > 0) {
        const pages = buildEditionPagesPayload(ed.edition_date, dayArticles);
        const cover = String(
          dayArticles.find((a) => Boolean(a.image_url))?.image_url ||
            '/src/assets/images/hero_parliament_india_1795494842593.jpg',
        );
        updateEdition.run(cover, pages.length, dayArticles.length, JSON.stringify({ pages }), ed.id);
      } else {
        deleteEdition.run(ed.id);
      }
    }
    setSetting('epaper_date_cleanup_v3', 'done');
  }

  // Enrich all stored E-Paper editions with full multi-paragraph article content, image rights, subtopics, and source links
  if (getSetting('epaper_detailed_v4', '') !== 'done') {
    const existingEditions = db
      .prepare('SELECT id, edition_date, content_json FROM editions')
      .all() as Array<{ id: string; edition_date: string; content_json: string }>;

    const findDayArticles = db.prepare(`
      SELECT a.id, a.title, a.slug, a.summary, a.content, a.image_url, a.image_rights, a.source_name, a.source_url, a.author, a.language, a.subtopic, a.views, a.published_at,
             c.name as category_name, c.slug as category_slug, s.name as state_name
      FROM articles a
      LEFT JOIN categories c ON c.id = a.category_id
      LEFT JOIN states s ON s.id = a.state_id
      WHERE a.status = 'published'
        AND date(datetime(a.published_at, '+5 hours', '+30 minutes')) = date(?)
      ORDER BY CASE WHEN a.source_url != '' THEN 0 ELSE 1 END, a.published_at DESC, a.featured DESC, a.breaking DESC
      LIMIT 40
    `);

    const findArticleByIdOrSlug = db.prepare(`
      SELECT a.id, a.title, a.slug, a.summary, a.content, a.image_url, a.image_rights, a.source_name, a.source_url, a.author, a.language, a.subtopic, a.views, a.published_at,
             c.name as category_name, c.slug as category_slug, s.name as state_name
      FROM articles a
      LEFT JOIN categories c ON c.id = a.category_id
      LEFT JOIN states s ON s.id = a.state_id
      WHERE a.id = ? OR a.slug = ?
      LIMIT 1
    `);

    const updateEdition = db.prepare(
      'UPDATE editions SET cover_image = ?, page_count = ?, article_count = ?, content_json = ? WHERE id = ?',
    );
    const updateEditionJsonOnly = db.prepare('UPDATE editions SET content_json = ? WHERE id = ?');

    for (const ed of existingEditions) {
      const dayArticles = findDayArticles.all(ed.edition_date) as Array<Record<string, unknown>>;
      if (dayArticles.length > 0) {
        const pages = buildEditionPagesPayload(ed.edition_date, dayArticles);
        const cover = String(
          dayArticles.find((a) => Boolean(a.image_url))?.image_url ||
            '/src/assets/images/hero_parliament_india_1795494842593.jpg',
        );
        updateEdition.run(cover, pages.length, dayArticles.length, JSON.stringify({ pages }), ed.id);
      } else {
        try {
          const parsed = JSON.parse(ed.content_json || '{}') as { pages?: Array<{ articles?: Array<Record<string, unknown>> }> };
          if (Array.isArray(parsed.pages)) {
            for (const page of parsed.pages) {
              if (!Array.isArray(page.articles)) continue;
              page.articles = page.articles.map((art) => {
                const match = findArticleByIdOrSlug.get(String(art.id || ''), String(art.slug || '')) as
                  | Record<string, unknown>
                  | undefined;
                return match ? { ...art, ...match } : art;
              });
            }
            updateEditionJsonOnly.run(JSON.stringify({ pages: parsed.pages }), ed.id);
          }
        } catch {
          // keep existing JSON intact if malformed
        }
      }
    }
    setSetting('epaper_detailed_v4', 'done');
  }

  // Ensure topic RSS feeds exist in existing DBs so Business, Sports, Tech, and Science stay stocked
  if (getSetting('rss_topic_feeds_v1', '') !== 'done') {
    const insertTopicRss = db.prepare(
      'INSERT OR IGNORE INTO rss_sources (id, name, feed_url, language, category_id, enabled) VALUES (?, ?, ?, ?, ?, 1)',
    );
    insertTopicRss.run('rss-gnews-biz', 'Google News India — Business', 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-IN&gl=IN&ceid=IN:en', 'en', 'cat-business');
    insertTopicRss.run('rss-gnews-sports', 'Google News India — Sports', 'https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en-IN&gl=IN&ceid=IN:en', 'en', 'cat-sports');
    insertTopicRss.run('rss-gnews-tech', 'Google News India — Technology', 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-IN&gl=IN&ceid=IN:en', 'en', 'cat-technology');
    insertTopicRss.run('rss-gnews-sci', 'Google News India — Science', 'https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en-IN&gl=IN&ceid=IN:en', 'en', 'cat-science');

    setSetting('rss_topic_feeds_v1', 'done');
  }

  const adminCount = (db.prepare('SELECT COUNT(*) as count FROM admin_users').get() as { count: number }).count;
  if (adminCount === 0) {
    db.prepare('INSERT INTO admin_users (id, name, email, role, password_hash, password_salt) VALUES (?, ?, ?, ?, ?, ?)').run(
      'adm-chief',
      'Maheep Editorial Chief',
      'maheepmedia@gmail.com',
      'super_admin',
      '',
      '',
    );
  }

  const authorCount = (db.prepare('SELECT COUNT(*) as count FROM authors').get() as { count: number }).count;
  if (authorCount === 0) {
    const insertAuthor = db.prepare(`
      INSERT OR IGNORE INTO authors (id, name, slug, role_title, beat, bio, email, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const baseAuthors = [
      ['auth-desk', 'Maheep Editorial Desk', 'maheep-editorial-desk', 'Editorial Desk', 'National & Breaking News', 'Central bilingual editorial desk curating verified news from India and across the world.', 'maheepmedia@gmail.com'],
      ['auth-raghavendra', 'Raghavendra Mishra', 'raghavendra-mishra', 'Senior Political Correspondent', 'National & Parliament', 'Covers Parliament, governance, public policy, and infrastructure projects across India.', ''],
      ['auth-anjali', 'अंजलि शर्मा', 'anjali-sharma', 'वरिष्ठ संवाददाता', 'राष्ट्रीय एवं जनहित', 'राष्ट्रीय नीति, सामाजिक सरोकार और शिक्षा से जुड़ी रिपोर्टिंग।', ''],
      ['auth-siddharth', 'Siddharth Kulkarni', 'siddharth-kulkarni', 'Business & Economy Editor', 'Business & Markets', 'Reports on RBI monetary policy, capital markets, startups, and fiscal developments.', ''],
      ['auth-meenakshi', 'Meenakshi Rathore', 'meenakshi-rathore', 'Diplomacy & World Correspondent', 'International Affairs', 'Covers global diplomacy, trade corridors, and multilateral summits.', ''],
      ['auth-arjun', 'Arjun Nair', 'arjun-nair', 'Sports Editor', 'Cricket & Athletics', 'Follows Indian cricket, hockey, badminton, and Olympic development programs.', ''],
      ['auth-kavita', 'Dr. Kavita Subramanian', 'dr-kavita-subramanian', 'Science & Technology Editor', 'Science & Tech', 'Writes on ISRO space missions, semiconductors, digital public infrastructure, and AI.', ''],
    ];
    for (const [id, name, slug, roleTitle, beat, bio, email] of baseAuthors) {
      insertAuthor.run(id, name, slug, roleTitle, beat, bio, email);
    }
  }

  const pollCount = (db.prepare('SELECT COUNT(*) as count FROM polls').get() as { count: number }).count;
  if (pollCount === 0) {
    db.prepare('INSERT INTO polls (id, question, category, active) VALUES (?, ?, ?, 1)').run(
      'poll-infra-priority',
      'Which public priority deserves the highest state allocation this quarter?',
      'National Policy',
    );
    const insOpt = db.prepare('INSERT INTO poll_options (id, poll_id, label, votes) VALUES (?, ?, ?, ?)');
    insOpt.run('opt-1', 'poll-infra-priority', 'Rail & Expressway Connectivity', 42);
    insOpt.run('opt-2', 'poll-infra-priority', 'Rural Healthcare & Primary Clinics', 58);
    insOpt.run('opt-3', 'poll-infra-priority', 'Clean Energy & Grid Modernization', 34);
    insOpt.run('opt-4', 'poll-infra-priority', 'Technical & Skill Education', 46);
  }

  const tlCount = (db.prepare('SELECT COUNT(*) as count FROM news_timelines').get() as { count: number }).count;
  if (tlCount === 0) {
    db.prepare('INSERT INTO news_timelines (id, title, slug, summary, topic_tag, active) VALUES (?, ?, ?, ?, ?, 1)').run(
      'tl-dpi-india',
      'India Digital Public Infrastructure & Semiconductor Push',
      'india-digital-infrastructure-timeline',
      'Chronological milestones tracking UPI expansion, ONDC adoption, and India Semiconductor Mission fabrication approvals.',
      'Technology & Economy',
    );
    const insEv = db.prepare(`
      INSERT INTO timeline_events (id, timeline_id, event_date, headline, details, source_name, source_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insEv.run('ev-1', 'tl-dpi-india', '2024-02-29', 'Cabinet Approves Multiple Chip Fab & ATMP Units', 'Union Cabinet clears commercial semiconductor fabrication and assembly facilities in Gujarat and Assam under India Semiconductor Mission.', 'PIB India', 'https://pib.gov.in');
    insEv.run('ev-2', 'tl-dpi-india', '2025-01-15', 'UPI Surpasses New Cross-Border Merchant Milestones', 'NPCI expands instant QR interoperability across partner corridors in Asia, Gulf, and Europe.', 'NPCI / RBI Reference', 'https://www.npci.org.in');
    insEv.run('ev-3', 'tl-dpi-india', getIndiaDateOffset(1), 'Grid & Digital Corridors Expand Across Tier-2 Cities', 'State industrial portals integrate real-time logistics and payment rails for MSMEs.', 'Maheep National Desk', '');

    db.prepare('INSERT INTO news_timelines (id, title, slug, summary, topic_tag, active) VALUES (?, ?, ?, ?, ?, 1)').run(
      'tl-isro-missions',
      'ISRO Space & Gaganyaan Milestone Tracker',
      'isro-space-missions-timeline',
      'Verified chronological log of ISRO orbital launches, Gaganyaan human-flight testing, and deep-space exploration milestones.',
      'Science & Space',
    );
    insEv.run('ev-4', 'tl-isro-missions', '2023-08-23', 'Chandrayaan-3 Vikram Lander Soft-Landing Success', 'India becomes the fourth nation to soft-land on the Moon and first near the lunar south pole.', 'ISRO Official', 'https://www.isro.gov.in');
    insEv.run('ev-5', 'tl-isro-missions', '2024-12-30', 'SpaDeX Autonomous Docking Demonstration Mission', 'ISRO launches Space Docking Experiment validating orbital rendezvous technology for future stations.', 'ISRO Official', 'https://www.isro.gov.in');
    insEv.run('ev-6', 'tl-isro-missions', getIndiaDateOffset(2), 'Gaganyaan & Launch Pad Readiness Reviews Continue', 'Propulsion and crew-escape qualification milestones progress at Sriharikota and Bengaluru.', 'Maheep Science Desk', '');
  }

  const elCount = (db.prepare('SELECT COUNT(*) as count FROM election_updates').get() as { count: number }).count;
  if (elCount === 0) {
    db.prepare(`
      INSERT INTO election_updates (id, region_title, phase_label, status, turnout_pct, total_seats, leading_parties_json, source_name, source_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'el-lok-sabha-ref',
      '18th Lok Sabha General Reference Tracker',
      '543 Parliamentary Constituencies',
      'Verified ECI Certified Archive',
      65.79,
      543,
      JSON.stringify([
        { party: 'NDA Alliance', seats: 293, color: '#00652E' },
        { party: 'INDIA Bloc', seats: 234, color: '#159B42' },
        { party: 'Others / Independents', seats: 16, color: '#6b7280' },
      ]),
      'Election Commission of India (Official Archive)',
      'https://results.eci.gov.in',
    );
  }
}

export function buildEditionPagesPayload(dateStr: string, articles: Array<Record<string, unknown>>) {
  const coverStories = articles.slice(0, 5);
  const usedIds = new Set(coverStories.map((a) => String(a.id || a.title || '')));
  const remaining = articles.filter((a) => !usedIds.has(String(a.id || a.title || '')));

  const takeByCat = (slugs: string[], limit = 8) => {
    const picked = remaining
      .filter((a) => !usedIds.has(String(a.id || a.title || '')) && slugs.includes(String(a.category_slug || '')))
      .slice(0, limit);
    for (const item of picked) usedIds.add(String(item.id || item.title || ''));
    return picked;
  };

  const nationalStories = takeByCat(['national', 'international', 'editorial'], 8);
  const stateStories = takeByCat(['state'], 8);
  const bizSports = takeByCat(['business', 'sports'], 8);
  const techEduSci = takeByCat(['technology', 'education', 'science', 'entertainment'], 8);
  const moreStories = remaining.filter((a) => !usedIds.has(String(a.id || a.title || ''))).slice(0, 8);

  const candidates = [
    { sectionTitle: 'Front Page · मुख्य पृष्ठ', subtitle: `Edition Date: ${dateStr}`, articles: coverStories },
    { sectionTitle: 'National & International · राष्ट्रीय एवं अंतर्राष्ट्रीय', subtitle: 'Parliament, Policy, Defence & Diplomacy', articles: nationalStories },
    { sectionTitle: 'States & Union Territories · राज्य समाचार', subtitle: 'Regional Reports Across India', articles: stateStories },
    { sectionTitle: 'Business & Sports · व्यापार और खेल', subtitle: 'Markets, Economy, Cricket & Athletics', articles: bizSports },
    { sectionTitle: 'Technology, Science & Education · तकनीक, विज्ञान एवं शिक्षा', subtitle: 'Innovation, Campuses & Culture', articles: techEduSci },
    { sectionTitle: 'Additional Dispatches · अन्य प्रमुख समाचार', subtitle: `More Reports for ${dateStr}`, articles: moreStories },
  ];

  const nonEmpty = candidates.filter((p) => p.articles.length > 0);
  return nonEmpty.map((p, idx) => ({
    pageNumber: idx + 1,
    sectionTitle: p.sectionTitle,
    subtitle: p.subtitle,
    articles: p.articles,
  }));
}

export function getSetting(key: string, fallback = ''): string {
  const row = db.prepare('SELECT setting_value FROM site_settings WHERE setting_key = ?').get(key) as
    | { setting_value: string }
    | undefined;
  return row ? row.setting_value : fallback;
}

export function setSetting(key: string, value: string): void {
  db.prepare(`
    INSERT INTO site_settings (id, setting_key, setting_value, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = datetime('now')
  `).run(`set-${crypto.randomUUID().slice(0, 8)}`, key, value);
}
