-- MAHEEP NEWS PORTAL — Supabase Seed Data
-- Categories, all 28 Indian States, all 8 Union Territories, initial RSS feeds, and site settings

INSERT INTO public.categories (name, slug, description) VALUES
  ('National', 'national', 'National headlines, Parliament, Government policy, Defence, Infrastructure, and Supreme Court updates.'),
  ('International', 'international', 'Global affairs, diplomacy, and international developments impacting India.'),
  ('State', 'state', 'Regional reporting across all 28 Indian states and 8 Union Territories.'),
  ('Business', 'business', 'Indian economy, Sensex/Nifty markets, banking, startups, industry, and personal finance.'),
  ('Sports', 'sports', 'Cricket, football, hockey, badminton, tennis, and Olympic disciplines.'),
  ('Technology', 'technology', 'Digital India, AI, semiconductors, cybersecurity, and telecom updates.'),
  ('Education', 'education', 'NEP reforms, board exams, universities, scholarships, and career pathways.'),
  ('Science', 'science', 'ISRO missions, scientific breakthroughs, climate, and healthcare research.'),
  ('Entertainment', 'entertainment', 'Indian cinema, literature, arts, and cultural heritage.'),
  ('Editorial', 'editorial', 'Opinion columns and investigative features from the Maheep Editorial Desk.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.states (name, slug, type, code) VALUES
  ('Andhra Pradesh', 'andhra-pradesh', 'state', 'AP'),
  ('Arunachal Pradesh', 'arunachal-pradesh', 'state', 'AR'),
  ('Assam', 'assam', 'state', 'AS'),
  ('Bihar', 'bihar', 'state', 'BR'),
  ('Chhattisgarh', 'chhattisgarh', 'state', 'CG'),
  ('Goa', 'goa', 'state', 'GA'),
  ('Gujarat', 'gujarat', 'state', 'GJ'),
  ('Haryana', 'haryana', 'state', 'HR'),
  ('Himachal Pradesh', 'himachal-pradesh', 'state', 'HP'),
  ('Jharkhand', 'jharkhand', 'state', 'JH'),
  ('Karnataka', 'karnataka', 'state', 'KA'),
  ('Kerala', 'kerala', 'state', 'KL'),
  ('Madhya Pradesh', 'madhya-pradesh', 'state', 'MP'),
  ('Maharashtra', 'maharashtra', 'state', 'MH'),
  ('Manipur', 'manipur', 'state', 'MN'),
  ('Meghalaya', 'meghalaya', 'state', 'ML'),
  ('Mizoram', 'mizoram', 'state', 'MZ'),
  ('Nagaland', 'nagaland', 'state', 'NL'),
  ('Odisha', 'odisha', 'state', 'OD'),
  ('Punjab', 'punjab', 'state', 'PB'),
  ('Rajasthan', 'rajasthan', 'state', 'RJ'),
  ('Sikkim', 'sikkim', 'state', 'SK'),
  ('Tamil Nadu', 'tamil-nadu', 'state', 'TN'),
  ('Telangana', 'telangana', 'state', 'TG'),
  ('Tripura', 'tripura', 'state', 'TR'),
  ('Uttar Pradesh', 'uttar-pradesh', 'state', 'UP'),
  ('Uttarakhand', 'uttarakhand', 'state', 'UK'),
  ('West Bengal', 'west-bengal', 'state', 'WB'),
  ('Andaman and Nicobar Islands', 'andaman-and-nicobar-islands', 'ut', 'AN'),
  ('Chandigarh', 'chandigarh', 'ut', 'CH'),
  ('Dadra and Nagar Haveli and Daman and Diu', 'dadra-nagar-haveli-daman-diu', 'ut', 'DN'),
  ('Delhi', 'delhi', 'ut', 'DL'),
  ('Jammu and Kashmir', 'jammu-and-kashmir', 'ut', 'JK'),
  ('Ladakh', 'ladakh', 'ut', 'LA'),
  ('Lakshadweep', 'lakshadweep', 'ut', 'LD'),
  ('Puducherry', 'puducherry', 'ut', 'PY')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.rss_sources (name, feed_url, language, category_id, enabled) VALUES
  ('Google News India (English)', 'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en', 'en', (SELECT id FROM public.categories WHERE slug = 'national'), true),
  ('Google News India (Hindi)', 'https://news.google.com/rss?hl=hi&gl=IN&ceid=IN:hi', 'hi', (SELECT id FROM public.categories WHERE slug = 'national'), true),
  ('PIB India (English)', 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1', 'en', (SELECT id FROM public.categories WHERE slug = 'national'), true),
  ('PIB India (Hindi)', 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=2&Regid=3', 'hi', (SELECT id FROM public.categories WHERE slug = 'national'), true)
ON CONFLICT (feed_url) DO NOTHING;

INSERT INTO public.site_settings (setting_key, setting_value) VALUES
  ('publishing_mode', 'manual_approval'),
  ('rss_interval_minutes', '60'),
  ('rss_auto_enabled', 'true'),
  ('ai_quality_checks', 'true'),
  ('tagline_hi', 'सच के साथ, जनता के विश्वास के साथ'),
  ('tagline_en', 'News from India & Beyond'),
  ('admin_email', 'maheepmedia@gmail.com')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO public.admin_users (name, email, role) VALUES
  ('Maheep Editorial Chief', 'maheepmedia@gmail.com', 'super_admin')
ON CONFLICT (email) DO NOTHING;
