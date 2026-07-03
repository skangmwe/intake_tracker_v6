# Deploy Recovery

Every deployed web frontend must self-recover from the stale-bundle gap that a deploy creates. When the host CDN replaces hashed assets, sessions that loaded the previous bundle must not be left in a broken state requiring the user to manually refresh. The app's responsibility is to detect the new build, recover transparently, and never interrupt active work to do so.

## Required outcomes

Implementation choice is open — webpack, Vite, Rollup, App Service, SWA, whatever the stack. The constraints below are non-negotiable.

- **Bake a build identifier into the bundle** at compile time. Same value emitted to a live source-of-truth the server refreshes on every deploy — a `/version.json` served with `Cache-Control: no-store`, an ETag header, or equivalent.
- **Poll the live source while the tab is visible.** On id mismatch, reload at a non-disruptive moment — `visibilitychange → hidden` is the simplest. **Never prompt** mid-task; users dismiss prompts and then trip a stale chunk.
- **Pause polling on hidden tabs.** Re-poll immediately on visible. No setInterval that runs in the background.
- **Catch stale-bundle errors as a backstop.** Global `unhandledrejection` + `error` listeners must recognise both bundler chunk-load failures (`ChunkLoadError`, `Loading chunk N failed`, `Failed to fetch dynamically imported module`) and Module Federation remote-load failures (`Failed to fetch ScriptResource`, `can't load remote`, `script load failed.*\.(js|mjs|css)`). Force `location.reload()` on a match.
- **Guard the backstop against loops.** A `sessionStorage` one-shot flag must prevent reload-spam on a genuinely-broken deploy. Clear the flag on a healthy boot so a future hit can still recover.
- **Emit telemetry on both paths** — detection and reload. Properties must not contain PII, file names, or build-id values.

## Acceptance criteria

A reviewer must be able to verify, from the running app:

- A build identifier is visible at runtime (e.g. `window.__BUILD_ID__` or a `/version.json` fetch).
- Changing the live identifier triggers reload at the next tab-blur — never mid-task.
- A simulated chunk-load failure (block the chunk URL in DevTools) triggers reload exactly once per session.
- Telemetry events fire on both detection and reload, with no PII in properties.
- Background tabs do not poll.
