// msalConfig reads runtime config at module-eval time, so these tests reset the module
// registry and re-import after seeding window.__APP_CONFIG__ (same idiom as config.test.ts).

describe('msalConfig', () => {
  const originalConfig = window.__APP_CONFIG__;

  afterEach(() => {
    if (originalConfig === undefined) {
      delete window.__APP_CONFIG__;
    } else {
      window.__APP_CONFIG__ = originalConfig;
    }
    jest.resetModules();
    jest.dontMock('@azure/msal-browser');
  });

  it('apiTokenRequest — no API scope configured — requests no scopes', async () => {
    // Arrange
    jest.resetModules();
    delete window.__APP_CONFIG__;

    // Act
    const mod = await import('./msalConfig');

    // Assert
    expect(mod.apiTokenRequest.scopes).toEqual([]);
  });

  it('apiTokenRequest — API scope configured — requests exactly that scope', async () => {
    // Arrange
    jest.resetModules();
    window.__APP_CONFIG__ = {
      entraClientId: 'client-1',
      entraTenantId: 'tenant-1',
      apiScope: 'api://x/access_as_user',
      appInsightsConnectionString: '',
    };

    // Act
    const mod = await import('./msalConfig');

    // Assert
    expect(mod.apiTokenRequest.scopes).toEqual(['api://x/access_as_user']);
  });

  it('getMsalInstance — builds a single sessionStorage-cached SPA client', async () => {
    // Arrange — mock the MSAL browser client so no real PKCE/network occurs.
    jest.resetModules();
    window.__APP_CONFIG__ = {
      entraClientId: 'client-1',
      entraTenantId: 'tenant-1',
      apiScope: 'api://x/access_as_user',
      appInsightsConnectionString: '',
    };
    const initialize = jest.fn().mockResolvedValue(undefined);
    let capturedConfig: { auth: { clientId: string }; cache: { cacheLocation: string } } | undefined;
    const construct = jest.fn().mockImplementation((config) => {
      capturedConfig = config;
      return {
        initialize,
        getAllAccounts: () => [],
        getActiveAccount: () => null,
        setActiveAccount: jest.fn(),
      };
    });
    jest.doMock('@azure/msal-browser', () => ({ PublicClientApplication: construct }));
    const mod = await import('./msalConfig');

    // Act
    const first = await mod.getMsalInstance();
    const second = await mod.getMsalInstance();

    // Assert — singleton (constructed + initialised once) with the mandated cache location.
    expect(first).toBe(second);
    expect(construct).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(capturedConfig?.auth.clientId).toBe('client-1');
    expect(capturedConfig?.cache.cacheLocation).toBe('sessionStorage');
  });
});
