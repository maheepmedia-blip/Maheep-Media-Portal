import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export const dbPath = path.join(DATA_DIR, 'maheep.db');
export const uploadsDir = UPLOADS_DIR;

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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
  `);

  seedInitialData();
}

function getIndiaDateOffset(daysAgo = 0): string {
  const now = new Date();
  now.setDate(now.getDate() - daysAgo);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
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
    insertRss.run('rss-pib-en', 'PIB India (English)', 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1', 'en', 'cat-national', 1);
    insertRss.run('rss-pib-hi', 'PIB India (Hindi)', 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=2&Regid=3', 'hi', 'cat-national', 1);
  }

  const settingsCount = (db.prepare('SELECT COUNT(*) as count FROM site_settings').get() as { count: number }).count;
  if (settingsCount === 0) {
    const insertSetting = db.prepare('INSERT INTO site_settings (id, setting_key, setting_value) VALUES (?, ?, ?)');
    const defaults: Array<[string, string]> = [
      ['publishing_mode', 'manual_approval'],
      ['rss_interval_minutes', '60'],
      ['rss_auto_enabled', 'true'],
      ['ai_quality_checks', 'true'],
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
    const now = Date.now();
    const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();
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
        published_at: hoursAgo(1),
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
        published_at: hoursAgo(2),
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
        published_at: hoursAgo(3),
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
        published_at: hoursAgo(4),
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
        published_at: hoursAgo(5),
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
        published_at: hoursAgo(6),
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
        published_at: hoursAgo(7),
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
        published_at: hoursAgo(8),
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
        published_at: hoursAgo(9),
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
        published_at: hoursAgo(10),
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
        published_at: hoursAgo(11),
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
        published_at: hoursAgo(12),
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
        published_at: hoursAgo(14),
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
        published_at: hoursAgo(16),
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
        published_at: hoursAgo(18),
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
        published_at: hoursAgo(20),
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

    const published = db
      .prepare(`
        SELECT a.id, a.title, a.slug, a.summary, a.image_url, a.source_name, a.author, a.language, a.published_at,
               c.name as category_name, c.slug as category_slug, s.name as state_name
        FROM articles a
        LEFT JOIN categories c ON c.id = a.category_id
        LEFT JOIN states s ON s.id = a.state_id
        WHERE a.status = 'published'
        ORDER BY a.featured DESC, a.published_at DESC
      `)
      .all() as Array<Record<string, unknown>>;

    for (let d = 0; d < 3; d++) {
      const dateStr = getIndiaDateOffset(d);
      const id = `ed-${dateStr}`;
      const pages = buildEditionPagesPayload(dateStr, published);
      insertEd.run(
        id,
        dateStr,
        d === 0 ? `Maheep Daily Digital Edition — ${dateStr}` : `Maheep Archive Edition — ${dateStr}`,
        `/api/editions/${id}/html`,
        '/src/assets/images/hero_parliament_india_1795494842593.jpg',
        pages.length,
        published.length,
        JSON.stringify({ pages }),
      );
    }
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
}

export function buildEditionPagesPayload(dateStr: string, articles: Array<Record<string, unknown>>) {
  const byCat = (slugs: string[]) => articles.filter((a) => slugs.includes(String(a.category_slug || '')));
  const coverStories = articles.slice(0, 4);
  const nationalStories = byCat(['national', 'international', 'editorial']).slice(0, 6);
  const stateStories = byCat(['state']).slice(0, 6);
  const bizSports = byCat(['business', 'sports']).slice(0, 6);
  const techEduSci = byCat(['technology', 'education', 'science', 'entertainment']).slice(0, 6);

  const pages = [
    { pageNumber: 1, sectionTitle: 'Front Page · मुख्य पृष्ठ', subtitle: `Edition Date: ${dateStr}`, articles: coverStories },
    { pageNumber: 2, sectionTitle: 'National & International · राष्ट्रीय एवं अंतर्राष्ट्रीय', subtitle: 'Parliament, Policy, Defence & Diplomacy', articles: nationalStories.length ? nationalStories : coverStories },
    { pageNumber: 3, sectionTitle: 'States & Union Territories · राज्य समाचार', subtitle: 'Regional Reports Across India', articles: stateStories.length ? stateStories : articles.slice(2, 6) },
    { pageNumber: 4, sectionTitle: 'Business & Sports · व्यापार और खेल', subtitle: 'Markets, Economy, Cricket & Athletics', articles: bizSports.length ? bizSports : articles.slice(1, 5) },
    { pageNumber: 5, sectionTitle: 'Technology, Science & Education · तकनीक, विज्ञान एवं शिक्षा', subtitle: 'Innovation, Campuses & Culture', articles: techEduSci.length ? techEduSci : articles.slice(0, 4) },
  ];
  return pages;
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
