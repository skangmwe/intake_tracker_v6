// MSAL browser configuration for the SPA (api-client-auth.md). Registered as a
// Single-page application platform: Authorization Code + PKCE, no client secret, tokens
// cached in sessionStorage (never localStorage — refresh tokens must not survive tab close
// or be reachable across tabs). Only built when SSO is configured (authMode === 'msal').

import {
  type Configuration,
  type PopupRequest,
  PublicClientApplication,
} from '@azure/msal-browser';

import { appConfig } from '@/config';

function buildConfiguration(): Configuration {
  return {
    auth: {
      clientId: appConfig.entraClientId,
      authority: `https://login.microsoftonline.com/${appConfig.entraTenantId}`,
      redirectUri: window.location.origin,
      postLogoutRedirectUri: window.location.origin,
    },
    cache: {
      // sessionStorage per api-client-auth.md — clears on tab close, not shared across tabs.
      cacheLocation: 'sessionStorage',
    },
  };
}

/** The scopes the SPA requests for API access. */
export const apiTokenRequest: PopupRequest = {
  scopes: appConfig.apiScope ? [appConfig.apiScope] : [],
};

/** Singleton MSAL instance. Created lazily so dev mode never instantiates it. */
let instance: PublicClientApplication | undefined;

export async function getMsalInstance(): Promise<PublicClientApplication> {
  if (!instance) {
    instance = new PublicClientApplication(buildConfiguration());
    await instance.initialize();
    const firstAccount = instance.getAllAccounts()[0];
    if (firstAccount && !instance.getActiveAccount()) {
      instance.setActiveAccount(firstAccount);
    }
  }
  return instance;
}
