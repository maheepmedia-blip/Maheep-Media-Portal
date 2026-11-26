export interface UtmContext {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
}

const STORAGE_KEY = 'maheep_utm_attribution';

export function captureUtmParams(): UtmContext {
  if (typeof window === 'undefined') {
    return { utm_source: '', utm_medium: '', utm_campaign: '', utm_term: '' };
  }

  const params = new URLSearchParams(window.location.search);
  const gclid = params.get('gclid') || '';
  const fbclid = params.get('fbclid') || '';

  let source = (params.get('utm_source') || '').trim();
  let medium = (params.get('utm_medium') || '').trim();
  const campaign = (params.get('utm_campaign') || '').trim();
  const term = (params.get('utm_term') || '').trim();

  if (!source && gclid) {
    source = 'google_ads';
    medium = medium || 'cpc';
  } else if (!source && fbclid) {
    source = 'meta';
    medium = medium || 'paid_social';
  }

  if (source || medium || campaign || term) {
    const captured: UtmContext = {
      utm_source: source.slice(0, 80),
      utm_medium: medium.slice(0, 80),
      utm_campaign: campaign.slice(0, 100),
      utm_term: term.slice(0, 120),
    };
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(captured));
    } catch {
      // Ignore storage error
    }
    return captured;
  }

  return getUtmContext();
}

export function getUtmContext(): UtmContext {
  if (typeof window === 'undefined') {
    return { utm_source: '', utm_medium: '', utm_campaign: '', utm_term: '' };
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UtmContext>;
      return {
        utm_source: String(parsed.utm_source || ''),
        utm_medium: String(parsed.utm_medium || ''),
        utm_campaign: String(parsed.utm_campaign || ''),
        utm_term: String(parsed.utm_term || ''),
      };
    }
  } catch {
    // Ignore storage error
  }
  return { utm_source: '', utm_medium: '', utm_campaign: '', utm_term: '' };
}

export function trackGrowthEvent(
  eventType: string,
  extra?: {
    path?: string;
    article_id?: string;
    category_slug?: string;
    language?: string;
    cta_variant?: string;
  },
): void {
  if (typeof window === 'undefined') return;
  const utm = getUtmContext();
  fetch('/api/analytics/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      event_type: eventType,
      path: extra?.path || window.location.pathname,
      article_id: extra?.article_id || '',
      category_slug: extra?.category_slug || '',
      language: extra?.language || 'all',
      cta_variant: extra?.cta_variant || '',
      ...utm,
    }),
  }).catch(() => {});
}

export function buildShareUrl(path: string, platform: string, campaign = 'social_share'): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${origin}${cleanPath}`);
  url.searchParams.set('utm_source', platform);
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', campaign);
  return url.toString();
}
