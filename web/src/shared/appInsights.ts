// App Insights client (web-error-logging.md). Initialises the JS SDK once with the
// connection string from runtime config; when no connection string is set (local dev) it
// no-ops so the app runs without telemetry. Never logs user content, AI responses, or PII
// (api-pii-handling.md) — callers pass only non-identifying metadata.

import { ApplicationInsights } from '@microsoft/applicationinsights-web';

import { appConfig } from '@/config';

let client: ApplicationInsights | undefined;

/** Initialise the SDK. Safe to call once at app entry; a no-op when no connection string. */
export function initAppInsights(): void {
  if (client || !appConfig.appInsightsConnectionString) {
    return;
  }

  client = new ApplicationInsights({
    config: {
      connectionString: appConfig.appInsightsConnectionString,
      enableAutoRouteTracking: true,
      disableCookiesUsage: true,
    },
  });
  client.loadAppInsights();
  client.trackPageView();
}

export function trackException(error: Error, props?: Record<string, unknown>): void {
  client?.trackException({ exception: error }, props);
}

export function trackEvent(name: string, props?: Record<string, unknown>): void {
  client?.trackEvent({ name }, props);
}
