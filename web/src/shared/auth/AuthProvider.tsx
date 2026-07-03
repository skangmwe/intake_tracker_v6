// The auth boundary. Two implementations behind one context (see authContext.ts):
//
//   * DEV (authMode 'dev'): no MSAL — the caller is treated as signed in and the api client
//     sends no token; the API's matching dev-bypass accepts it. Lets the app run locally and
//     under test without a live tenant.
//   * MSAL (authMode 'msal'): Entra SSO via @azure/msal-react. Auto-triggers a redirect
//     sign-in, sets the active account, and wires acquireTokenSilent into the api client.
//
// Both paths install the api-client token provider and render the app only once authenticated.

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { InteractionType, type PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider, useIsAuthenticated, useMsal, useMsalAuthentication } from '@azure/msal-react';

import { appConfig } from '@/config';
import { LoadingScreen } from '@/shared/components/Feedback/LoadingScreen';
import { setAuthTokenProvider } from '@/shared/http/apiClient';

import { apiTokenRequest, getMsalInstance } from './msalConfig';
import { AuthContext, type AuthContextValue, initialsOf } from './authContext';

const DEV_USER = { name: 'Local Developer', username: 'dev@localhost' };

export function AuthProvider({ children }: { children: ReactNode }) {
  return appConfig.authMode === 'dev' ? (
    <DevAuthProvider>{children}</DevAuthProvider>
  ) : (
    <MsalAuthProvider>{children}</MsalAuthProvider>
  );
}

function DevAuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    setAuthTokenProvider(async () => null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: true,
      user: {
        name: DEV_USER.name,
        username: DEV_USER.username,
        initials: initialsOf(DEV_USER.name),
      },
      logout: () => undefined,
    }),
    [],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function MsalAuthProvider({ children }: { children: ReactNode }) {
  const [instance, setInstance] = useState<PublicClientApplication | null>(null);

  useEffect(() => {
    let active = true;
    void getMsalInstance().then((pca) => {
      if (active) setInstance(pca);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!instance) {
    return <LoadingScreen label="Starting up…" />;
  }

  return (
    <MsalProvider instance={instance}>
      <MsalAuthGate>{children}</MsalAuthGate>
    </MsalProvider>
  );
}

function MsalAuthGate({ children }: { children: ReactNode }) {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  // Auto-trigger a redirect sign-in when there is no session.
  useMsalAuthentication(InteractionType.Redirect, apiTokenRequest);

  useEffect(() => {
    const firstAccount = accounts[0];
    if (firstAccount && !instance.getActiveAccount()) {
      instance.setActiveAccount(firstAccount);
    }
  }, [accounts, instance]);

  useEffect(() => {
    setAuthTokenProvider(async () => {
      const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];
      if (!account) return null;
      try {
        const result = await instance.acquireTokenSilent({ ...apiTokenRequest, account });
        return result.accessToken;
      } catch {
        // Silent failed (consent / expiry) — fall back to interactive; the redirect
        // leaves the page, so returning null here is fine.
        await instance.acquireTokenRedirect(apiTokenRequest);
        return null;
      }
    });
  }, [instance]);

  const value = useMemo<AuthContextValue | null>(() => {
    if (!isAuthenticated) return null;
    const account = instance.getActiveAccount() ?? accounts[0];
    const name = account?.name ?? account?.username ?? 'Account';
    return {
      isAuthenticated: true,
      user: { name, username: account?.username ?? '', initials: initialsOf(name) },
      logout: () => {
        void instance.logoutRedirect();
      },
    };
    // accounts drives the active-account resolution above.
  }, [isAuthenticated, instance, accounts]);

  if (!value) {
    return <LoadingScreen label="Signing you in…" />;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
