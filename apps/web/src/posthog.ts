import posthog from 'posthog-js';

const apiKey = import.meta.env?.VITE_POSTHOG_KEY;
const apiHost = import.meta.env?.VITE_POSTHOG_HOST;
const configured = typeof window !== 'undefined' && !!apiKey && !!apiHost;

if (!apiKey || !apiHost) {
  if (import.meta.env?.DEV) {
    const variable = apiKey ? 'VITE_POSTHOG_HOST' : 'VITE_POSTHOG_KEY';
    console.error(new Error(`${variable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variable} is configured`));
  }
} else if (configured) {
  posthog.init(apiKey, {
    api_host: apiHost,
    capture_pageview: 'history_change',
    capture_pageleave: true,
    person_profiles: 'identified_only',
    // Keep auth form text and input values out of automatic click events.
    mask_all_text: true,
    mask_all_element_attributes: true,
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
    logs: {
      serviceName: 'shootball-arena-web',
      environment: import.meta.env.MODE,
    },
  });
}

// Missing analytics configuration must not interrupt authentication or gameplay.
export default {
  capture: (...args: Parameters<typeof posthog.capture>) => configured ? posthog.capture(...args) : undefined,
  identify: (...args: Parameters<typeof posthog.identify>) => { if (configured) posthog.identify(...args); },
  reset: () => { if (configured) posthog.reset(); },
  logger: { info: (...args: Parameters<typeof posthog.logger.info>) => { if (configured) posthog.logger.info(...args); } },
};
