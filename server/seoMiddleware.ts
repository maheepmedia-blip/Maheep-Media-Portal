import crypto from 'node:crypto';
import { db, getSetting, setSetting } from './db.ts';
import { findCountryBySlug } from '../shared/countries.ts';

export const DEFAULT_CANONICAL_ORIGIN = 'https://maheep-media-news.onrender.com';

export function resolveCanonicalBaseUrl(): string {
  const customDomain = getSetting('custom_domain', '').trim();
  if (customDomain && /^https?:\/\//i.test(customDomain)) {
    return customDomain.replace(/\/$/, '');
  }
  const settingCanonical = getSetting('canonical_base_url', '').trim();
  if (settingCanonical && /^https?:\/\//i.test(settingCanonical)) {
    return settingCanonical.replace(/\/$/, '');
  }
  const renderUrl = process.env.RENDER_EXTERNAL_URL?.trim();
  if (renderUrl && /^https?:\/\//i.test(renderUrl)) {
    return renderUrl.replace(/\/$/, '');
  }
  const appUrl = process.env.APP_URL?.trim();
  if (
    appUrl &&
    appUrl !== 'MY_APP_URL' &&
    /^https?:\/\//i.test(appUrl) &&
    !appUrl.includes('.run.app') &&
    !appUrl.includes('googleusercontent') &&
    !appUrl.includes('localhost')
  ) {
    return appUrl.replace(/\/$/, '');
  }
  return DEFAULT_CANONICAL_ORIGIN;
}

export function getOrCreateIndexNowKey(): string {
  const existing = getSetting('indexnow_key', '').trim();
  if (/^[a-f0-9]{24,64}$/i.test(existing)) {
    return existing;
  }
  const generated = crypto.randomBytes(16).toString('hex');
  setSetting('indexnow_key', generated);
  return generated;
}

function escapeXmlAttr(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

interface RouteSeoMeta {
  title: string;
  description: string;
  canonicalPath: string;
  ogType: 'website' | 'article';
  ogImage: string;
  robots?: string;
  jsonLd?: Record<string, unknown>;
}

export function resolveRouteSeoMeta(rawUrl: string, baseUrl: string): RouteSeoMeta {
  let pathname = '/';
  let searchParams = new URLSearchParams();
  try {
    const parsed = new URL(rawUrl, baseUrl);
    pathname = parsed.pathname || '/';
    searchParams = parsed.searchParams;
  } catch {
    pathname = '/';
  }

  const defaultImage = `${baseUrl}/pwa-512x512.png`;

  if (pathname === '/' || pathname === '/index.html') {
    return {
      title: 'Best E-Paper Site — Maheep E-Paper | Maheep News Portal',
      description:
        'Maheep E-Paper (https://maheep-media-news.onrender.com/) is India’s best free daily digital e-paper site. Read 25-page English & Hindi editions across The Beacon (National & 36 States), Our Pride (339 Cities), and WorldWire (50 Countries) with zero paywall.',
      canonicalPath: '/',
      ogType: 'website',
      ogImage: defaultImage,
    };
  }

  if (pathname === '/epaper' || pathname === '/newspaper.html') {
    const sec = searchParams.get('section') || 'broadsheet';
    const citySlug = searchParams.get('city') || '';
    const slug = searchParams.get('slug') || '';
    const dateParam = searchParams.get('date') || '';

    let title = 'Best E-Paper Site — Maheep E-Paper | 25-Page Free Digital Broadsheet';
    let description =
      'Read today’s 25-page Maheep E-Paper free online in English & Hindi at https://maheep-media-news.onrender.com/epaper — full A4 PDF export, 300 daily reports, audio narration, and instant archive search.';
    let canonicalPath = '/epaper';

    if (sec === 'our-pride') {
      const cityRow = citySlug
        ? (db.prepare('SELECT name, state_name FROM cities WHERE slug = ?').get(citySlug) as
            | { name: string; state_name: string }
            | undefined)
        : undefined;
      const cityName = cityRow ? cityRow.name.replace(' (town)', '') : 'Every Indian City';
      title = `${cityName} E-Paper — Our Pride | Best E-Paper Site · Maheep E-Paper`;
      description = `Read 300 verified local dispatches for ${cityName}${cityRow?.state_name ? `, ${cityRow.state_name}` : ''} free on Maheep E-Paper (Our Pride Edition).`;
      canonicalPath = citySlug ? `/epaper?section=our-pride&city=${encodeURIComponent(citySlug)}` : '/epaper?section=our-pride';
    } else if (sec === 'beacon') {
      title = 'The Beacon E-Paper — India National & 36 States | Best E-Paper Site';
      description =
        'Read The Beacon by Maheep E-Paper: 300 verified national & state reports covering India and all 36 States & Union Territories in Hindi and English.';
      canonicalPath = slug
        ? `/epaper?section=beacon&scopeType=state&slug=${encodeURIComponent(slug)}`
        : '/epaper?section=beacon';
    } else if (sec === 'worldwire') {
      const country = slug ? findCountryBySlug(slug) : undefined;
      title = `${country ? `${country.name} ` : ''}WorldWire E-Paper — Global News | Best E-Paper Site`;
      description = `Read WorldWire by Maheep E-Paper covering 50 nations${country ? ` including ${country.name}` : ''} with 300 bilingual global dispatches.`;
      canonicalPath = slug
        ? `/epaper?section=worldwire&scopeType=country&slug=${encodeURIComponent(slug)}`
        : '/epaper?section=worldwire';
    } else if (dateParam) {
      title = `Maheep E-Paper (${dateParam}) — Best E-Paper Site · 25-Page Digital Edition`;
      canonicalPath = `/epaper?date=${encodeURIComponent(dateParam)}`;
    }

    return {
      title,
      description,
      canonicalPath,
      ogType: 'website',
      ogImage: defaultImage,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Maheep E-Paper — Best E-Paper Site',
        url: `${baseUrl}${canonicalPath}`,
        applicationCategory: 'NewsApplication',
        operatingSystem: 'Web',
        isAccessibleForFree: true,
        inLanguage: ['en-IN', 'hi-IN'],
        publisher: {
          '@type': 'NewsMediaOrganization',
          name: 'Maheep News Portal',
          url: baseUrl,
        },
      },
    };
  }

  if (pathname.startsWith('/news/')) {
    const slug = decodeURIComponent(pathname.slice('/news/'.length)).split('/')[0];
    const row = db
      .prepare(`
        SELECT a.title, a.summary, a.image_url, a.published_at, a.updated_at, a.author, a.language,
               c.name as category_name, s.name as state_name
        FROM articles a
        LEFT JOIN categories c ON c.id = a.category_id
        LEFT JOIN states s ON s.id = a.state_id
        WHERE a.slug = ? AND a.status = 'published'
      `)
      .get(slug) as
      | {
          title: string;
          summary: string;
          image_url: string;
          published_at: string;
          updated_at: string;
          author: string;
          language: string;
          category_name: string | null;
          state_name: string | null;
        }
      | undefined;

    if (row) {
      const absImg = row.image_url?.startsWith('http')
        ? row.image_url
        : row.image_url
          ? `${baseUrl}${row.image_url.startsWith('/') ? '' : '/'}${row.image_url}`
          : defaultImage;
      const canonical = `/news/${encodeURIComponent(slug)}`;
      return {
        title: `${row.title} — Maheep E-Paper & News Portal`,
        description: row.summary || row.title,
        canonicalPath: canonical,
        ogType: 'article',
        ogImage: absImg,
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'NewsArticle',
          headline: row.title,
          description: row.summary || row.title,
          image: [absImg],
          datePublished: row.published_at,
          dateModified: row.updated_at || row.published_at,
          inLanguage: row.language === 'hi' ? 'hi-IN' : 'en-IN',
          isAccessibleForFree: true,
          mainEntityOfPage: `${baseUrl}${canonical}`,
          author: { '@type': 'Person', name: row.author || 'Maheep Editorial Desk' },
          publisher: {
            '@type': 'NewsMediaOrganization',
            name: 'Maheep News Portal',
            url: baseUrl,
          },
          articleSection: row.category_name || 'News',
          contentLocation: row.state_name ? { '@type': 'Place', name: `${row.state_name}, India` } : undefined,
        },
      };
    }
  }

  if (pathname.startsWith('/states/')) {
    const slug = decodeURIComponent(pathname.slice('/states/'.length)).split('/')[0];
    const st = db.prepare('SELECT name, slug, code FROM states WHERE slug = ?').get(slug) as
      | { name: string; slug: string; code: string }
      | undefined;
    if (st) {
      return {
        title: `${st.name} News & Local E-Paper — Maheep E-Paper`,
        description: `Verified regional news, civic governance, and daily Our Pride E-Paper dispatches from ${st.name} (${st.code}), India.`,
        canonicalPath: `/states/${encodeURIComponent(st.slug)}`,
        ogType: 'website',
        ogImage: defaultImage,
      };
    }
  }

  if (pathname.startsWith('/guides/')) {
    const slug = decodeURIComponent(pathname.slice('/guides/'.length)).split('/')[0];
    const guide = db
      .prepare('SELECT title, summary, image_url, author, language FROM content_guides WHERE slug = ? AND published = 1')
      .get(slug) as
      | { title: string; summary: string; image_url: string; author: string; language: string }
      | undefined;
    if (guide) {
      const absImg = guide.image_url?.startsWith('http')
        ? guide.image_url
        : guide.image_url
          ? `${baseUrl}${guide.image_url}`
          : defaultImage;
      return {
        title: `${guide.title} — Citizen Guides | Maheep News Portal`,
        description: guide.summary || guide.title,
        canonicalPath: `/guides/${encodeURIComponent(slug)}`,
        ogType: 'article',
        ogImage: absImg,
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: guide.title,
          description: guide.summary,
          inLanguage: guide.language === 'hi' ? 'hi-IN' : 'en-IN',
          isAccessibleForFree: true,
          author: { '@type': 'Person', name: guide.author || 'Maheep Editorial Desk' },
        },
      };
    }
  }

  const staticMetaMap: Record<string, Omit<RouteSeoMeta, 'ogType' | 'ogImage'>> = {
    '/national': {
      title: 'The Beacon · National News — Maheep E-Paper & News Portal',
      description: 'Verified Indian Parliament, central policy, courts, defence, and national reporting in English and Hindi.',
      canonicalPath: '/national',
    },
    '/states': {
      title: 'Our Pride · All 28 States & 8 UTs News — Maheep E-Paper',
      description: 'Regional news and 339 city editions across all 28 Indian States and 8 Union Territories.',
      canonicalPath: '/states',
    },
    '/business-sports': {
      title: 'Business, Economy & Sports News — Maheep News Portal',
      description: 'Indian financial markets, RBI policy, startups, infrastructure, and cricket & sports dispatches.',
      canonicalPath: '/business-sports',
    },
    '/guides': {
      title: 'Citizen Guides, Fact-Check Explainers & Videos — Maheep News Portal',
      description: 'Free step-by-step civic guides, welfare explainers, and media-literacy checklists for Indian citizens.',
      canonicalPath: '/guides',
    },
    '/briefing': {
      title: 'Ask AI & 60-Second Audio Briefing — Maheep E-Paper',
      description: 'Listen to 60-second daily news audio briefings and get verified answers grounded in published reporting.',
      canonicalPath: '/briefing',
    },
    '/timelines': {
      title: 'India News Timelines & Election Tracker — Maheep News Portal',
      description: 'Chronological news timelines, policy milestones, and election trackers across India.',
      canonicalPath: '/timelines',
    },
    '/authors': {
      title: 'Editorial Desks & Journalists — Maheep News Portal',
      description: 'Meet the correspondents and editorial desks behind Maheep E-Paper and Maheep News Portal.',
      canonicalPath: '/authors',
    },
    '/search': {
      title: 'Search Archive — Maheep E-Paper & News Portal',
      description: 'Search every published article, E-Paper edition, city desk, state, and country across Maheep News Portal.',
      canonicalPath: '/search',
    },
    '/contact': {
      title: 'Contact & Editorial Consultation — Maheep News Portal',
      description: 'Reach Maheep News Portal newsroom desks, corrections desk, or advertising & partnership inquiries.',
      canonicalPath: '/contact',
    },
    '/admin': {
      title: 'Editorial Admin Desk — Maheep News Portal',
      description: 'Editorial management console.',
      canonicalPath: '/admin',
      robots: 'noindex, nofollow',
    },
  };

  const matched = staticMetaMap[pathname];
  if (matched) {
    return {
      ...matched,
      ogType: 'website',
      ogImage: defaultImage,
    };
  }

  return {
    title: 'Best E-Paper Site — Maheep E-Paper | Maheep News Portal',
    description:
      'Maheep E-Paper — Best free daily digital e-paper site in India covering Hindi & English editions across 339 cities, 36 States/UTs, and 50 countries.',
    canonicalPath: pathname,
    ogType: 'website',
    ogImage: defaultImage,
  };
}

export function injectRouteSeoMeta(html: string, rawUrl: string, baseUrl: string): string {
  const meta = resolveRouteSeoMeta(rawUrl, baseUrl);
  const fullUrl = `${baseUrl}${meta.canonicalPath}`;
  const titleEsc = escapeXmlAttr(meta.title);
  const descEsc = escapeXmlAttr(meta.description);
  const imgEsc = escapeXmlAttr(meta.ogImage);
  const urlEsc = escapeXmlAttr(fullUrl);
  const robotsContent = meta.robots || 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

  let out = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${titleEsc}</title>`)
    .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, `<meta name="description" content="${descEsc}" />`)
    .replace(/<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/i, `<meta name="robots" content="${robotsContent}" />`)
    .replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${titleEsc}" />`)
    .replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${descEsc}" />`)
    .replace(/<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:type" content="${meta.ogType}" />`)
    .replace(/<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:title" content="${titleEsc}" />`)
    .replace(/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:description" content="${descEsc}" />`);

  if (/<link\s+rel="canonical"[^>]*>/i.test(out)) {
    out = out.replace(/<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${urlEsc}" />`);
  } else {
    out = out.replace('</head>', `    <link rel="canonical" href="${urlEsc}" />\n  </head>`);
  }

  if (/<meta\s+property="og:url"[^>]*>/i.test(out)) {
    out = out.replace(/<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${urlEsc}" />`);
  } else {
    out = out.replace('</head>', `    <meta property="og:url" content="${urlEsc}" />\n  </head>`);
  }

  if (/<meta\s+property="og:image"[^>]*>/i.test(out)) {
    out = out.replace(/<meta\s+property="og:image"[^>]*>/i, `<meta property="og:image" content="${imgEsc}" />`);
  } else {
    out = out.replace('</head>', `    <meta property="og:image" content="${imgEsc}" />\n  </head>`);
  }

  if (meta.jsonLd) {
    out = out.replace(
      '</head>',
      `    <script id="ssr-route-jsonld" type="application/ld+json">${safeJsonLd(meta.jsonLd)}</script>\n  </head>`,
    );
  }

  return out;
}
