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
  ai_assisted?: number | boolean;
  views: number;
  published_at: string;
  created_at: string;
  updated_at: string;
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
