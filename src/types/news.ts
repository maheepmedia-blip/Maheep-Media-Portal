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

export interface CityItem {
  id: string;
  rank: number;
  name: string;
  slug: string;
  state_id: string | null;
  state_name: string;
  state_slug?: string | null;
  state_type?: string | null;
  state_code?: string | null;
  is_capital: number | boolean;
  census_2011: number;
  census_2001: number | null;
  change_pct: string;
  lat: number;
  lon: number;
  article_count?: number;
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  image_url: string;
  image_rights?: string;
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
  city_id?: string | null;
  city_name?: string;
  city_slug?: string;
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
  streak_days?: number;
  last_read_date?: string;
  last_epaper_edition?: string;
  last_epaper_page?: number;
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
    views?: number;
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
  | 'all_slots'
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

export interface AuthorProfile {
  id: string;
  name: string;
  slug: string;
  role_title: string;
  beat: string;
  bio: string;
  email: string;
  twitter_handle: string;
  avatar_url: string;
  active: number | boolean;
  article_count?: number;
  created_at: string;
}

export interface SocialPostItem {
  id: string;
  article_id: string;
  article_title?: string;
  article_slug?: string;
  platform: 'x' | 'whatsapp' | 'facebook' | 'linkedin' | 'telegram';
  message: string;
  share_url: string;
  scheduled_at: string;
  status: 'scheduled' | 'ready' | 'posted' | 'cancelled';
  posted_at: string | null;
  created_by: string;
  created_at: string;
}

export interface NewsletterCampaign {
  id: string;
  subject: string;
  intro_text: string;
  language: 'all' | 'en' | 'hi';
  article_ids_json: string;
  sent_count: number;
  failed_count: number;
  status: string;
  sent_at: string;
  created_by: string;
}

export interface SystemErrorLog {
  id: string;
  source: string;
  route: string;
  message: string;
  stack_summary: string;
  resolved: number | boolean;
  created_at: string;
}

export interface ReaderFollow {
  id: string;
  follow_type: 'category' | 'state' | 'author';
  target_slug: string;
  target_label: string;
  created_at: string;
}

export interface ReaderEpaperBookmark {
  id: string;
  edition_date: string;
  page_number: number;
  section_title: string;
  created_at: string;
}

export interface PollItem {
  id: string;
  question: string;
  category: string;
  language: string;
  totalVotes: number;
  options: Array<{ id: string; label: string; votes: number }>;
}

export interface TimelineEventItem {
  id: string;
  timeline_id: string;
  event_date: string;
  headline: string;
  summary: string;
  source_name: string;
  source_url: string;
}

export interface TimelineItem {
  id: string;
  title: string;
  slug: string;
  topic: string;
  summary: string;
  updated_at: string;
  events: TimelineEventItem[];
}

export interface ElectionUpdate {
  id: string;
  title: string;
  region: string;
  total_seats: number;
  declared_seats: number;
  summary: string;
  data_json: string;
  source_name: string;
  source_url: string;
  updated_at: string;
}

export interface AiCitation {
  title: string;
  slug: string;
  source_name: string;
  published_at: string;
  category_name?: string;
  state_name?: string;
}

export interface ContentGuide {
  id: string;
  title: string;
  slug: string;
  guide_type: 'guide' | 'explainer' | 'video' | 'checklist';
  category: string;
  language: 'en' | 'hi';
  summary: string;
  body: string;
  video_url: string;
  image_url: string;
  read_minutes: number;
  author: string;
  published: number | boolean;
  views: number;
  shares: number;
  created_at: string;
  updated_at: string;
}

export interface GrowthConfig {
  cro_sticky_bar_enabled: boolean;
  cro_cta_headline: string;
  cro_cta_button: string;
  local_seo_hq_city: string;
  local_seo_region: string;
}
