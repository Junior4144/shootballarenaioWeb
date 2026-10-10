import { inject, type BeforeSendEvent } from '@vercel/analytics';

const HOSTS = new Set(['www.orb-skirmish.com', 'orb-skirmish.com', 'shootball-arena.vercel.app']);

/** Do not send OAuth codes, reset tokens, query strings or admin page views. */
export function publicPageview(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const url = new URL(event.url);
    if (event.type !== 'pageview' || url.protocol !== 'https:' || !HOSTS.has(url.hostname)
      || /^\/admin(?:\/|$)/.test(url.pathname)) return null;
    return { ...event, url: url.origin + url.pathname };
  } catch { return null; }
}

// GCP builds the app, so select production explicitly instead of relying on
// Vercel build-time injection. Direct GCP, preview and local visits stay out.
if (import.meta.env?.PROD && typeof location !== 'undefined' && HOSTS.has(location.hostname)) {
  inject({ mode: 'production', beforeSend: publicPageview });
}
