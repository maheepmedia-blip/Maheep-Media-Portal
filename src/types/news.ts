export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  article_count?: number;
}

export interface StateItem {
  id: string;
  name: string;
  slug: string;
  type: 'state' | 'ut';
  code: string;
  article_count?: number;
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  image_url: string;
  source_name: string;
  source_url: string;
  author: string;
  language: 'en' | 'hi';
  category_id: string | null;
  category_name?: string;
  category_slug?: string;
  state_id: string | null;
  state_name?: string;
  state_slug?: string;
  state_type?: 'state' | 'ut';
  state_code?: string;
  subtopic?: string;
  status: 'draft' | 'pending' | 'published' | 'archived';
  featured: number | boolean;
  breaking: number | boolean;
  breaking_candidate?: number | boolean;
  ai_assisted?: number | boolean;
  ai_audit_json?: string;
  scheduled_at?: string | null;
  unpublish_at?: string | null;
  reviewed_by?: string;
  reviewed_at?: string | null;
  views: number;
  published_at: string;
  created_at: string;
  updated_at: string;
}

export interface ArticleRevision {
  id: string;
  article_id: string;
  editor_email: string;
  title: string;
  summary: string;
  content: string;
  status: string;
  change_note: string;
  created_at: string;
}

export interface CommentItem {
  id: string;
  article_id: string;
  article_title?: string;
  article_slug?: string;
  author_name: string;
  author_email?: string;
  body: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface ReaderUser {
  id: string;
  name: string;
  email: string;
  preferred_language: 'all' | 'en' | 'hi';
  font_size: 'sm' | 'md' | 'lg';
}

export interface EditionPage {
  pageNumber: number;
  sectionTitle: string;
  subtitle: string;
  articles: Array<{
    id?: string;
    title: string;
    slug?: string;
    summary: string;
    source_name: string;
    author: string;
    category_name: string;
    state_name?: string;
    image_url?: string;
    published_at?: string;
  }>;
}

export interface Edition {
  id: string;
  edition_date: string;
  title: string;
  pdf_url: string;
  cover_image: string;
  page_count: number;
  article_count: number;
  status: 'draft' | 'published';
  content_json: string;
  created_at: string;
}

export interface RssSource {
  id: string;
  name: string;
  feed_url: string;
  language: 'en' | 'hi';
  category_id: string | null;
  category_name?: string;
  enabled: number | boolean;
  last_fetched_at: string | null;
  last_error: string;
  imported_count: number;
}

export interface RssLog {
  id: string;
  source_id: string;
  source_name: string;
  status: 'success' | 'partial' | 'failed';
  imported: number;
  skipped: number;
  failed: number;
  message: string;
  ran_at: string;
}

export interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  inquiry_type: string;
  status: 'new' | 'reviewed' | 'resolved';
  email_sent: number;
  created_at: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'admin' | 'editor';
  created_at?: string;
}

export type AdPlacement =
  | 'header_banner'
  | 'homepage_mid'
  | 'sidebar'
  | 'article_inline'
  | 'epaper_banner';

export interface Advertisement {
  id: string;
  title: string;
  advertiser: string;
  placement: AdPlacement;
  image_url: string;
  target_url: string;
  description: string;
  cta_text: string;
  language: 'all' | 'en' | 'hi';
  active: number | boolean;
  start_date: string;
  end_date: string;
  impressions: number;
  clicks: number;
  created_at: string;
  updated_at: string;
}

export interface BackupEntry {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  verified: boolean;
  integrityMessage: string;
  articleCount: number;
  editionCount: number;
}

export interface CronJobRun {
  id: string;
  job_name: string;
  idempotency_key: string;
  status: 'running' | 'success' | 'failed' | 'skipped';
  trigger_source: string;
  summary: string;
  error_message: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
}

export interface AdminAuditLog {
  id: string;
  actor_email: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string;
  details_json: string;
  ip: string;
  created_at: string;
}

export interface AiUsageLog {
  id: string;
  action: string;
  article_id: string;
  actor_email: string;
  model: string;
  status: 'success' | 'failed';
  latency_ms: number;
  result_summary: string;
  created_at: string;
}

export interface EmailLog {
  id: string;
  recipient: string;
  subject: string;
  template_type: string;
  status: 'sent' | 'failed' | 'skipped';
  error_message: string;
  retries: number;
  created_at: string;
  sent_at: string;
}
