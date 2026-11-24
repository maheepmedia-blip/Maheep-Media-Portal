import { useEffect } from 'react';

interface BreadcrumbItem {
  name: string;
  path: string;
}

interface SeoHeadProps {
  title: string;
  description: string;
  canonicalPath?: string;
  ogType?: 'website' | 'article';
  ogImage?: string;
  prevPath?: string;
  nextPath?: string;
  breadcrumbs?: BreadcrumbItem[];
  jsonLd?: Record<string, unknown>;
}

export function SeoHead({
  title,
  description,
  canonicalPath,
  ogType = 'website',
  ogImage,
  prevPath,
  nextPath,
  breadcrumbs,
  jsonLd,
}: SeoHeadProps) {
  useEffect(() => {
    document.title = title;
    const origin = window.location.origin;

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
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[property="og:type"]', 'content', ogType);
    setMeta('meta[property="og:site_name"]', 'content', 'Maheep News Portal');
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', description);

    const resolvedOgImage = ogImage
      ? ogImage.startsWith('http')
        ? ogImage
        : `${origin}${ogImage.startsWith('/') ? '' : '/'}${ogImage}`
      : `${origin}/src/assets/images/hero_parliament_india_1795494842593.jpg`;

    setMeta('meta[property="og:image"]', 'content', resolvedOgImage);
    setMeta('meta[name="twitter:image"]', 'content', resolvedOgImage);

    if (canonicalPath) {
      const fullUrl = `${origin}${canonicalPath}`;
      setMeta('meta[property="og:url"]', 'content', fullUrl);
      setLink('maheep-canonical-link', 'canonical', fullUrl);
      setLink('maheep-hreflang-en', 'alternate', fullUrl, { hreflang: 'en-IN' });
      setLink('maheep-hreflang-hi', 'alternate', fullUrl, { hreflang: 'hi-IN' });
      setLink('maheep-hreflang-default', 'alternate', fullUrl, { hreflang: 'x-default' });
    }

    const prevEl = document.getElementById('maheep-pagination-prev');
    if (prevPath) {
      setLink('maheep-pagination-prev', 'prev', `${origin}${prevPath}`);
    } else if (prevEl) {
      prevEl.remove();
    }

    const nextEl = document.getElementById('maheep-pagination-next');
    if (nextPath) {
      setLink('maheep-pagination-next', 'next', `${origin}${nextPath}`);
    } else if (nextEl) {
      nextEl.remove();
    }

    const scriptId = 'maheep-dynamic-jsonld';
    const existingScript = document.getElementById(scriptId);
    if (existingScript) existingScript.remove();

    const graph: Array<Record<string, unknown>> = [];
    if (jsonLd) graph.push(jsonLd);
    if (breadcrumbs && breadcrumbs.length > 0) {
      graph.push({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbs.map((b, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: b.name,
          item: `${origin}${b.path}`,
        })),
      });
    }

    if (graph.length > 0) {
      const s = document.createElement('script');
      s.id = scriptId;
      s.type = 'application/ld+json';
      s.textContent = JSON.stringify(graph.length === 1 ? graph[0] : { '@context': 'https://schema.org', '@graph': graph });
      document.head.appendChild(s);
    }
  }, [title, description, canonicalPath, ogType, ogImage, prevPath, nextPath, breadcrumbs, jsonLd]);

  return null;
}
