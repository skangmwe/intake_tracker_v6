describe('appConfig', () => {
  const original = window.__APP_CONFIG__;

  afterEach(() => {
    if (original === undefined) {
      delete window.__APP_CONFIG__;
    } else {
      window.__APP_CONFIG__ = original;
    }
    jest.resetModules();
  });

  it('appConfig — no client id injected — defaults to dev mode', () => {
    // Arrange
    jest.resetModules();
    delete window.__APP_CONFIG__;

    // Act
    const mod = require('./config') as typeof import('./config');

    // Assert
    expect(mod.appConfig.authMode).toBe('dev');
    expect(mod.appConfig.entraClientId).toBe('');
  });

  it('appConfig — client id injected — is msal mode with the injected values', () => {
    // Arrange
    jest.resetModules();
    window.__APP_CONFIG__ = {
      entraClientId: 'client-123',
      entraTenantId: 'tenant-abc',
      apiScope: 'api://x/access_as_user',
      appInsightsConnectionString: 'InstrumentationKey=k',
    };

    // Act
    const mod = require('./config') as typeof import('./config');

    // Assert
    expect(mod.appConfig.authMode).toBe('msal');
    expect(mod.appConfig.entraClientId).toBe('client-123');
    expect(mod.appConfig.apiScope).toBe('api://x/access_as_user');
  });
});
