// Runtime app configuration. Non-secret values only (Entra client/tenant ids, the API
// scope, and the App Insights connection string are all safe in the browser — the AI
// connection string is a write-only ingestion key, not an access key: web-error-logging.md).
//
// Values are injected by the host at deploy time via `window.__APP_CONFIG__` (a small
// inline/served config the CDN stamps per environment). Locally none is injected, so the
// app falls back to DEV mode: no MSAL, the API's matching dev-bypass accepts the request
// (see api-auth.md / dev-local-testing). Auth mode is DERIVED — a real `clientId` means SSO.

export type AuthMode = 'dev' | 'msal';

interface RawAppConfig {
  entraClientId?: string;
  entraTenantId?: string;
  apiScope?: string;
  appInsightsConnectionString?: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: RawAppConfig;
  }
}

export interface AppConfig {
  authMode: AuthMode;
  entraClientId: string;
  entraTenantId: string;
  /** The API scope the SPA requests a token for, e.g. `api://<api-app-id>/access_as_user`. */
  apiScope: string;
  appInsightsConnectionString: string;
}

function readConfig(): AppConfig {
  const raw = (typeof window !== 'undefined' && window.__APP_CONFIG__) || {};
  const entraClientId = raw.entraClientId?.trim() ?? '';
  return {
    // A populated client id is the signal that SSO is configured for this environment.
    authMode: entraClientId.length > 0 ? 'msal' : 'dev',
    entraClientId,
    entraTenantId: raw.entraTenantId?.trim() ?? '',
    apiScope: raw.apiScope?.trim() ?? '',
    appInsightsConnectionString: raw.appInsightsConnectionString?.trim() ?? '',
  };
}

export const appConfig: AppConfig = readConfig();
