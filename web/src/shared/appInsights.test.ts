import { initAppInsights, trackEvent, trackException } from './appInsights';

describe('appInsights (no connection string — dev)', () => {
  it('initAppInsights — no connection string — is a safe no-op', () => {
    expect(() => initAppInsights()).not.toThrow();
  });

  it('trackException / trackEvent — uninitialised — do nothing without throwing', () => {
    expect(() => trackException(new Error('boom'), { where: 'test' })).not.toThrow();
    expect(() => trackEvent('thing-happened', { n: 1 })).not.toThrow();
  });
});

describe('appInsights (connection string configured)', () => {
  const originalConfig = window.__APP_CONFIG__;

  afterEach(() => {
    if (originalConfig === undefined) {
      delete window.__APP_CONFIG__;
    } else {
      window.__APP_CONFIG__ = originalConfig;
    }
    jest.resetModules();
    jest.dontMock('@microsoft/applicationinsights-web');
  });

  it('initAppInsights — connection string present — loads the SDK once and forwards telemetry', async () => {
    // Arrange — seed config and mock the SDK so no real telemetry is sent.
    jest.resetModules();
    window.__APP_CONFIG__ = {
      entraClientId: '',
      entraTenantId: '',
      apiScope: '',
      appInsightsConnectionString: 'InstrumentationKey=abc',
    };
    const loadAppInsights = jest.fn();
    const trackPageView = jest.fn();
    const trackExceptionSpy = jest.fn();
    const trackEventSpy = jest.fn();
    jest.doMock('@microsoft/applicationinsights-web', () => ({
      ApplicationInsights: jest.fn().mockImplementation(() => ({
        loadAppInsights,
        trackPageView,
        trackException: trackExceptionSpy,
        trackEvent: trackEventSpy,
      })),
    }));
    const mod = await import('./appInsights');

    // Act
    mod.initAppInsights();
    mod.initAppInsights(); // idempotent — no second client
    mod.trackException(new Error('x'), { where: 'unit' });
    mod.trackEvent('did-thing', { n: 2 });

    // Assert
    expect(loadAppInsights).toHaveBeenCalledTimes(1);
    expect(trackPageView).toHaveBeenCalledTimes(1);
    expect(trackExceptionSpy).toHaveBeenCalledTimes(1);
    expect(trackEventSpy).toHaveBeenCalledTimes(1);
  });
});
