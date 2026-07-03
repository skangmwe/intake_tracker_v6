// Deploy-recovery bootstrap — per web-deploy-recovery.md.
//
// Scaffold state: the visible-tab poller + stale-chunk error listener are stubbed
// but functional in shape. Real polling of /version.json against __BUILD_ID__ is
// added by a hardening slice; leaving the shape in scaffold so consumers see the
// contract.

const POLL_INTERVAL_MS = 60_000;
const RELOAD_FLAG = 'ai-tracker-reload-once';

declare global {
  interface Window {
    __BUILD_ID__?: string;
  }
}

export function initDeployRecovery(): void {
  window.addEventListener('unhandledrejection', onPossibleStaleChunk);
  window.addEventListener('error', onPossibleStaleChunk);

  let intervalId: number | undefined;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && intervalId === undefined) {
      intervalId = window.setInterval(checkForNewBuild, POLL_INTERVAL_MS);
      void checkForNewBuild();
    } else if (document.visibilityState === 'hidden' && intervalId !== undefined) {
      window.clearInterval(intervalId);
      intervalId = undefined;
    }
  });

  if (document.visibilityState === 'visible') {
    intervalId = window.setInterval(checkForNewBuild, POLL_INTERVAL_MS);
  }
}

async function checkForNewBuild(): Promise<void> {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return;
    const body = (await res.json()) as { buildId: string };
    if (window.__BUILD_ID__ && body.buildId !== window.__BUILD_ID__) {
      queueReloadOnHidden();
    }
  } catch {
    // Silent — a failed poll is not a defect.
  }
}

function queueReloadOnHidden(): void {
  const reload = () => {
    if (document.visibilityState === 'hidden') location.reload();
  };
  document.addEventListener('visibilitychange', reload, { once: true });
}

function onPossibleStaleChunk(event: Event): void {
  const msg = extractMessage(event);
  if (!msg) return;
  const stalePatterns = [
    /ChunkLoadError/,
    /Loading chunk \d+ failed/,
    /Failed to fetch dynamically imported module/,
    /Failed to fetch ScriptResource/,
    /can't load remote/,
    /script load failed.*\.(js|mjs|css)/,
  ];
  if (stalePatterns.some((pattern) => pattern.test(msg))) {
    if (sessionStorage.getItem(RELOAD_FLAG)) return;
    sessionStorage.setItem(RELOAD_FLAG, '1');
    location.reload();
  }
}

function extractMessage(event: Event): string | undefined {
  if (event instanceof PromiseRejectionEvent) return String(event.reason?.message ?? event.reason);
  if (event instanceof ErrorEvent) return event.message;
  return undefined;
}
