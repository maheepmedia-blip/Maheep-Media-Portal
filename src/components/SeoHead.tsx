import { useEffect } from 'react';

export const CANONICAL_ORIGIN = 'https://maheep-media-news.onrender.com';

interface BreadcrumbItem {
  name: string;
  path: string;
}

export interface FaqSchemaItem {
  question: string;
  answer: string;
}

interface SeoHeadProps {
  title: string;
  description: string;
  canonicalPath?: string;
  ogType?: 'website' | 'article';
  ogImage?: string;
  ogLocale?: 'en_IN' | 'hi_IN';
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  keywords?: string;
  geoPlacename?: string;
  prevPath?: string;
  nextPath?: string;
  breadcrumbs?: BreadcrumbItem[];
  faqItems?: FaqSchemaItem[];
  speakableSelectors?: string[];
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
}

export function getCanonicalBaseOrigin(): string {
  if (typeof window === 'undefined') return CANONICAL_ORIGIN;
  const host = window.location.hostname;
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.onrender.com') ||
    host.includes('run.app') ||
    host.includes('googleusercontent')
  ) {
    return CANONICAL_ORIGIN;
  }
  return window.location.origin;
}

export function SeoHead({
  title,
  description,
  canonicalPath,
  ogType = 'website',
  ogImage,
  ogLocale = 'en_IN',
  publishedTime,
  modifiedTime,
  section,
  keywords,
  geoPlacename,
  prevPath,
  nextPath,
  breadcrumbs,
  faqItems,
  speakableSelectors,
  jsonLd,
}: SeoHeadProps) {
  useEffect(() => {
    document.title = title;
    const canonicalOrigin = getCanonicalBaseOrigin();
    const runtimeOrigin = typeof window !== 'undefined' ? window.location.origin : canonicalOrigin;

    const setMeta = (selector: string, attr: string, value: string) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement('meta');
        if (selector.includes('property=')) {
          const prop = selector.match(/property="([^"]+)"/)?.[1];
          if (prop) el.setAttribute('property', prop);
        } else {
          const name = selector.match(/name="([^"]+)"/)?.[1];
          if (name) el.setAttribute('name', name);
        }
        document.head.appendChild(el);
      }
      el.setAttribute(attr, value);
    };

    const setLink = (id: string, rel: string, href: string, extra?: Record<string, string>) => {
      let link = document.getElementById(id) as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.id = id;
        document.head.appendChild(link);
      }
      link.setAttribute('rel', rel);
      link.setAttribute('href', href);
      if (extra) {
        for (const [k, v] of Object.entries(extra)) {
          link.setAttribute(k, v);
        }
      }
    };

    setMeta('meta[name="description"]', 'content', description);
    setMeta(
      'meta[name="robots"]',
      'content',
      'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
    );
    if (keywords) setMeta('meta[name="keywords"]', 'content', keywords);
    if (geoPlacename) setMeta('meta[name="geo.placename"]', 'content', geoPlacename);

    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[property="og:type"]', 'content', ogType);
    setMeta('meta[property="og:site_name"]', 'content', 'Maheep News Portal');
    setMeta('meta[property="og:locale"]', 'content', ogLocale);
    setMeta('meta[property="og:locale:alternate"]', 'content', ogLocale === 'hi_IN' ? 'en_IN' : 'hi_IN');
    if (publishedTime) setMeta('meta[property="article:published_time"]', 'content', publishedTime);
    if (modifiedTime) setMeta('meta[property="article:modified_time"]', 'content', modifiedTime);
    if (section) setMeta('meta[property="article:section"]', 'content', section);

    setMeta('meta[name="twitter:card"]', 'content', 'summary_large_image');
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', description);

    const resolvedOgImage = ogImage
      ? ogImage.startsWith('http')
        ? ogImage
        : `${canonicalOrigin}${ogImage.startsWith('/') ? '' : '/'}${ogImage}`
      : `${canonicalOrigin}/pwa-512x512.png`;

    setMeta('meta[property="og:image"]', 'content', resolvedOgImage);
    setMeta('meta[name="twitter:image"]', 'content', resolvedOgImage);

    if (canonicalPath) {
      const cleanPath = canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`;
      const fullUrl = `${canonicalOrigin}${cleanPath}`;
      setMeta('meta[property="og:url"]', 'content', fullUrl);
      setLink('maheep-canonical-link', 'canonical', fullUrl);
      setLink('maheep-hreflang-en', 'alternate', fullUrl, { hreflang: 'en-IN' });
      setLink('maheep-hreflang-hi', 'alternate', fullUrl, { hreflang: 'hi-IN' });
      setLink('maheep-hreflang-default', 'alternate', fullUrl, { hreflang: 'x-default' });
    }

    const prevEl = document.getElementById('maheep-pagination-prev');
    if (prevPath) {
      setLink('maheep-pagination-prev', 'prev', `${runtimeOrigin}${prevPath}`);
    } else if (prevEl) {
      prevEl.remove();
    }

    const nextEl = document.getElementById('maheep-pagination-next');
    if (nextPath) {
      setLink('maheep-pagination-next', 'next', `${runtimeOrigin}${nextPath}`);
    } else if (nextEl) {
      nextEl.remove();
    }

    const scriptId = 'maheep-dynamic-jsonld';
    const existingScript = document.getElementById(scriptId);
    if (existingScript) existingScript.remove();

    const graph: Array<Record<string, unknown>> = [];
    if (jsonLd) {
      if (Array.isArray(jsonLd)) {
        graph.push(...jsonLd);
      } else {
        graph.push(jsonLd);
      }
    }
    if (breadcrumbs && breadcrumbs.length > 0) {
      graph.push({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbs.map((b, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: b.name,
          item: `${canonicalOrigin}${b.path}`,
        })),
      });
    }
    if (faqItems && faqItems.length > 0) {
      graph.push({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqItems.map((f) => ({
          '@type': 'Question',
          name: f.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: f.answer,
          },
        })),
      });
    }
    if (speakableSelectors && speakableSelectors.length > 0 && canonicalPath) {
      graph.push({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        url: `${canonicalOrigin}${canonicalPath}`,
        speakable: {
          '@type': 'SpeakableSpecification',
          cssSelector: speakableSelectors,
        },
      });
    }

    if (graph.length > 0) {
      const s = document.createElement('script');
      s.id = scriptId;
      s.type = 'application/ld+json';
      s.textContent = JSON.stringify(
        graph.length === 1 ? graph[0] : { '@context': 'https://schema.org', '@graph': graph },
      );
      document.head.appendChild(s);
    }
  }, [
    title,
    description,
    canonicalPath,
    ogType,
    ogImage,
    ogLocale,
    publishedTime,
    modifiedTime,
    section,
    keywords,
    geoPlacename,
    prevPath,
    nextPath,
    breadcrumbs,
    faqItems,
    speakableSelectors,
    jsonLd,
  ]);

  return null;
}
