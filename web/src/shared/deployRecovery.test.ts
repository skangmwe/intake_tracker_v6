// Behaviour tests for the deploy-recovery bootstrap (web-deploy-recovery.md):
// visible-tab version polling, reload-on-hidden, and the stale-chunk error backstop
// with its sessionStorage one-shot guard.

import { initDeployRecovery } from './deployRecovery';

describe('initDeployRecovery', () => {
  const realLocation = window.location;
  let reload: jest.Mock;
  let visibility: DocumentVisibilityState;

  beforeEach(() => {
    reload = jest.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...realLocation, reload, origin: realLocation.origin },
    });
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    sessionStorage.clear();
    window.__BUILD_ID__ = 'build-current';
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
    jest.useRealTimers();
    delete window.__BUILD_ID__;
  });

  it('initDeployRecovery — new build detected — reloads only once the tab is hidden', async () => {
    // Arrange
    jest.useFakeTimers();
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buildId: 'build-next' }),
    }) as unknown as typeof fetch;

    // Act — visible tab polls; advance one interval so the mismatch is detected.
    initDeployRecovery();
    await jest.advanceTimersByTimeAsync(60_000);

    // Assert — never reloads mid-task (while visible)...
    expect(reload).not.toHaveBeenCalled();

    // ...only when the tab becomes hidden.
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('initDeployRecovery — same build — does not schedule a reload', async () => {
    // Arrange
    jest.useFakeTimers();
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buildId: 'build-current' }),
    }) as unknown as typeof fetch;

    // Act
    initDeployRecovery();
    await jest.advanceTimersByTimeAsync(60_000);
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));

    // Assert
    expect(reload).not.toHaveBeenCalled();
  });

  it('initDeployRecovery — tab hidden — pauses polling', async () => {
    // Arrange
    jest.useFakeTimers();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buildId: 'build-current' }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    // Act
    initDeployRecovery();
    await jest.advanceTimersByTimeAsync(60_000);
    const pollsWhileVisible = fetchMock.mock.calls.length;
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await jest.advanceTimersByTimeAsync(180_000);

    // Assert — no further polls once hidden.
    expect(pollsWhileVisible).toBeGreaterThanOrEqual(1);
    expect(fetchMock).toHaveBeenCalledTimes(pollsWhileVisible);
  });

  it('initDeployRecovery — stale-chunk error — reloads once (session one-shot)', () => {
    // Arrange — hidden so no polling interval is started (error backstop still installs).
    visibility = 'hidden';
    initDeployRecovery();

    // Act + Assert — first stale-chunk error reloads.
    window.dispatchEvent(new ErrorEvent('error', { message: 'Loading chunk 7 failed.' }));
    expect(reload).toHaveBeenCalledTimes(1);

    // A second stale-chunk error is suppressed by the sessionStorage flag.
    window.dispatchEvent(new ErrorEvent('error', { message: 'Loading chunk 7 failed.' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('initDeployRecovery — stale-chunk rejection — reloads', () => {
    // Arrange
    visibility = 'hidden';
    initDeployRecovery();
    const promise = Promise.reject(new Error('ChunkLoadError: dynamic import failed'));
    promise.catch(() => undefined);

    // Act
    window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', {
        promise,
        reason: new Error('ChunkLoadError: dynamic import failed'),
      }),
    );

    // Assert
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('initDeployRecovery — unrelated error — does not reload', () => {
    // Arrange
    visibility = 'hidden';
    initDeployRecovery();

    // Act
    window.dispatchEvent(new ErrorEvent('error', { message: 'TypeError: x is not a function' }));

    // Assert
    expect(reload).not.toHaveBeenCalled();
  });
});
