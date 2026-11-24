-- MAHEEP NEWS PORTAL — Complete Supabase PostgreSQL Schema
-- Includes tables, indexes, foreign keys, triggers, and strict Row Level Security (RLS)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Categories
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. States & Union Territories (All 28 States + 8 UTs)
CREATE TABLE IF NOT EXISTS public.states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('state', 'ut')),
  code TEXT NOT NULL UNIQUE
);

-- 3. Articles
CREATE TABLE IF NOT EXISTS public.articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT DEFAULT '',
  source_name TEXT NOT NULL DEFAULT 'Maheep News Desk',
  source_url TEXT DEFAULT '',
  author TEXT NOT NULL DEFAULT 'Editorial Desk',
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'hi')),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  state_id UUID REFERENCES public.states(id) ON DELETE SET NULL,
  subtopic TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'published', 'archived')),
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  breaking BOOLEAN NOT NULL DEFAULT FALSE,
  ai_assisted BOOLEAN NOT NULL DEFAULT FALSE,
  views INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_articles_status_published ON public.articles(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category ON public.articles(category_id);
CREATE INDEX IF NOT EXISTS idx_articles_state ON public.articles(state_id);
CREATE INDEX IF NOT EXISTS idx_articles_language ON public.articles(language);
CREATE INDEX IF NOT EXISTS idx_articles_source_url ON public.articles(source_url);
CREATE INDEX IF NOT EXISTS idx_articles_featured_breaking ON public.articles(featured, breaking);

-- 4. E-Paper Editions
CREATE TABLE IF NOT EXISTS public.editions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_date DATE NOT NULL UNIQUE,
  title TEXT NOT NULL,
  pdf_url TEXT DEFAULT '',
  cover_image TEXT DEFAULT '',
  page_count INTEGER NOT NULL DEFAULT 1,
  article_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  content_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_editions_date ON public.editions(edition_date DESC);

-- 5. RSS Sources
CREATE TABLE IF NOT EXISTS public.rss_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  feed_url TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'hi')),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_fetched_at TIMESTAMPTZ,
  last_error TEXT DEFAULT '',
  imported_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. RSS Import Logs
CREATE TABLE IF NOT EXISTS public.rss_import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES public.rss_sources(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  imported INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  message TEXT DEFAULT '',
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Admin Users (linked to Supabase Auth UUID; never allow public insert)
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('super_admin', 'admin', 'editor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Contacts & Consultations
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  inquiry_type TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved')),
  email_sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Newsletter Subscribers
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Site Settings
CREATE TABLE IF NOT EXISTS public.site_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_articles_updated_at
  BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_site_settings_updated_at
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper function: Verify authenticated admin role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE auth_user_id = auth.uid()
      AND role IN ('super_admin', 'admin', 'editor')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rss_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rss_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Public Read Policies
CREATE POLICY "Public read categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Public read states" ON public.states FOR SELECT USING (true);
CREATE POLICY "Public read published articles" ON public.articles FOR SELECT USING (status = 'published');
CREATE POLICY "Public read published editions" ON public.editions FOR SELECT USING (status = 'published');
CREATE POLICY "Public read non-sensitive site settings" ON public.site_settings FOR SELECT USING (
  setting_key IN ('tagline_hi', 'tagline_en', 'epaper_header', 'dark_mode_default')
);

-- Public Insert Policies (Contacts & Newsletter only, strictly validated on Edge Function)
CREATE POLICY "Public submit contact" ON public.contacts FOR INSERT WITH CHECK (true);
CREATE POLICY "Public subscribe newsletter" ON public.newsletter_subscribers FOR INSERT WITH CHECK (true);

-- Admin Full Management Policies
CREATE POLICY "Admins manage categories" ON public.categories FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage states" ON public.states FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage articles" ON public.articles FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage editions" ON public.editions FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage rss_sources" ON public.rss_sources FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins read rss_logs" ON public.rss_import_logs FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins read admin_users" ON public.admin_users FOR SELECT USING (public.is_admin());
CREATE POLICY "Super admins manage admin_users" ON public.admin_users FOR ALL USING (
  EXISTS (SELECT 1 FROM public.admin_users WHERE auth_user_id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "Admins manage contacts" ON public.contacts FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage subscribers" ON public.newsletter_subscribers FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage settings" ON public.site_settings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Storage Bucket for E-Paper PDFs and Article Images
INSERT INTO storage.buckets (id, name, public)
VALUES ('epapers', 'epapers', true), ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read epapers" ON storage.objects FOR SELECT USING (bucket_id IN ('epapers', 'media'));
CREATE POLICY "Admins upload media and epapers" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id IN ('epapers', 'media') AND public.is_admin()
);
CREATE POLICY "Admins delete media and epapers" ON storage.objects FOR DELETE USING (
  bucket_id IN ('epapers', 'media') AND public.is_admin()
);
