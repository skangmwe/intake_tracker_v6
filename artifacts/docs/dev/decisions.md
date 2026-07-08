# Architecture Decision Records

Running log of non-obvious build decisions. Newest first. Each entry names the decision, the
context, and the rationale so a future reader (or reviewer) understands why the code is the way
it is.

---

## ADR-0002 — Dev-only npm audit finding accepted (uuid via webpack-dev-server)

**Slice:** 2 (Auth & app shell) · **Date:** 2026-07-03 · **Status:** accepted

`npm audit` reports **3 moderate** advisories, all from a single transitive package:

- **Package:** `uuid` (GHSA-w5hq-g745-h8pq — missing buffer bounds check in v3/v5/v6).
- **Path:** `webpack-dev-server` → `sockjs` → `uuid`.

**Decision:** accept, do not remediate now. The blocking gate — `npm audit --omit=dev` (shipped
dependencies) — reports **0 vulnerabilities**; the finding is confined to `webpack-dev-server`,
which runs only on a developer's machine and is never part of the production bundle
(`web-dependency-security.md` — dev-only moderate findings are recorded, not blocking). The only
fix offered is `webpack-dev-server@6` (a breaking major); taking it now is out of scope for this
slice. Revisit when webpack-dev-server is next upgraded.

---

## ADR-0001 — Auth: real Entra (MSAL) with a config-gated dev bypass

**Slice:** 2 (Auth & app shell) · **Date:** 2026-07-03 · **Status:** accepted

**Context.** The SPA must sign users in via Entra SSO (`api-client-auth.md`), but the local dev
environment has no live tenant, and jest/Playwright cannot exercise a real redirect flow.

**Decision.** Both the API and the SPA carry two auth paths behind one seam:

- **SPA** (`web/src/shared/auth/`): `authMode` is derived — a populated `entraClientId` in the
  injected `window.__APP_CONFIG__` means **MSAL** (Authorization Code + PKCE, `sessionStorage`
  cache per `api-client-auth.md`); an empty client id means **dev** mode (no MSAL, the caller is
  treated as signed in, the api client sends no token). E2E and unit tests run in dev mode.
- **API** (`AuthenticationSetup`): `Auth:DevBypass:Enabled` (Development only) swaps
  `Microsoft.Identity.Web` JWT-bearer validation for a fixed-identity handler
  (`DevBypassAuthHandler`) so `dotnet run` works without a tenant. The flag is OFF by default and
  is non-secret placeholder config; production uses real token validation.

The two dev paths are aligned: the dev SPA sends no token and the dev API accepts anonymous, so
the full stack runs end-to-end locally while production is pure SSO.

**Also decided in this slice (recorded here for traceability, not separate ADRs):**

- **`Users.Theme` column (migration 013).** `POST /users/me/theme` needs somewhere to persist,
  and server-side storage lets the preference roam across devices. This is a one-column addition
  beyond the "no migrations" framing of the slice cut — small, additive, and directly in service
  of the slice's theme-toggle capability. See `data-model.md`.
- **SPA CSP keeps `script-src 'self'` (no `'unsafe-inline'`).** The required pre-paint theme-init
  inline script is allowed via its exact SHA-256 hash in `web/public/index.html`; the redundant
  build-id inline script was removed (deploy-recovery now reads the webpack DefinePlugin
  `__BUILD_ID__` constant). Editing the theme-init script means recomputing the hash.
- **Design-system CSS lives under `web/src/mws/`.** The prototype's McDermott `_ds` token +
  component CSS is ported verbatim there and imported once from `App.tsx`; the app-shell layer
  (`app-shell.css`) sits alongside it. The design-conformance hook exempts `/mws/`, so token
  definitions (raw hex) and the sidebar-overlay rgba idiom are not flagged, while every app
  component style elsewhere stays token-only.

---

## ADR-0003 — `fix/platform-side-nav` shipped with the design-fidelity gate relaxed (2026-07-08)

The Admin/Platform sidebar reorganisation (the six Platform items and the Admin
surfaces collapsed into grouped settings-style side-list pages via a new shared
`SideNavLayout`; the standalone Platform sidebar section removed and Platform folded
under Admin as a platform-admin-gated item; nested-screen page gutters normalised so
Workspace and Platform screens are inset consistently) is an **intentional, project-owner-approved
departure from the original prototype's sidebar**. Because the built sidebar now differs
from the prototype by design, the mandatory build-vs-prototype **design-fidelity render &
compare** would flag every affected screen as drift.

The project owner explicitly relaxed the design-fidelity gate for this change. The
substantive gates were run and passed: full web unit suite (1098/1098), `tsc --noEmit`
clean, token-conformance hook PASS (0 raw-colour / off-spec-radius violations), and code
review + security review clean. The design-fidelity render/compare step was **not** run;
`reviews/.last-clean-run.json` records `phases_run` **without** `design-fidelity-web` so the
cache honestly reflects what executed rather than claiming a fidelity pass that did not happen.

Follow-up: when the sidebar reorganisation is reconciled back into the design source
(prototype/blueprint), re-run `/dev-review-and-remediate` with the design-fidelity step so a
future ship of this surface is gated normally again.
