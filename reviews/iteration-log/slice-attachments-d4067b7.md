# slice-attachments-d4067b7 — iteration log

**Label:** slice-attachments-d4067b7
**Scope source:** uncommitted working tree (slice/attachments branch)
**Layers in scope:** database, api, web (frontend + design handoff present)
**Started:** 2026-07-05 (slice 11 completion gate)

## Iteration 1

### Phase 0 — Unit tests

- **Web (jest):** full suite **568 passed / 568**. New attachment suites (`AttachmentsCard`, `useAttachments`, `api`, `apiClient`) all green. Coverage gap-fill applied: added `api.test.ts` (wrappers → 100%), plus in-flight-upload, failed-download, disabled-query-key, and link-without-url branch tests.
  - Global branch coverage **79.49%** vs 80% floor. Within the documented **[78%, 80%) tolerance** (`web-testing.md`): the shortfall is **pre-existing** — many other features' thin `api.ts` wrappers sit under 80% branch. Arithmetic proof it is not this slice's regression: the attachments folder is 89.7% branch, and adding files above the global average can only raise the global — so the baseline was below 79.49%. Uncovered branches in this slice's files are defensive (reducer no-op map, dismiss-not-in-map) with required behaviour cases covered.
- **API (dotnet):** build **exit 0** (Azure.Storage.Blobs 12.29.1 restored). Tests **286 passed / 287**. The one failure — `HealthTests.Health_returns200_withStatusOk` (500 on `/health`) — was **proven pre-existing**: reverting this slice's `Program.cs` + `appsettings.json` to base `dev` and rebuilding reproduces the identical 500. Environmental (empty `AzureAd` config path on the anonymous endpoint), unrelated to attachments. Out of slice scope per surgical-changes.
- **Database (tSQLt):** authored `test_Attachments` (8 cases) + a carry-across case in `test_Escalation`. **Not executed locally** — the repo has no local tSQLt harness (install / apply-migrations / RunAll); DB tests run in CI via the migrations-runner Container App Job (`database-migrations.md`). Authoring is the slice deliverable; execution is CI-gated.

### Phase 1 — Code review

- **Design token conformance (manual):** the deterministic hook (`check-design-conformance.sh`) hangs on a Git-Bash process-substitution quirk in this environment, so the equivalent scan was run by hand over the slice's `*.css` + `*.tsx`: **no raw hex / rgb / hsl / oklch, no named colours in colour props, no inline styles, `border-radius` only `var(--radius)`.**
- **Finding [1] — Mechanical, applied:** `.attachments__spinner` used `var(--color-teal)` directly. Critical rule 2 (`_core-requirements.md`) reserves direct `--color-teal` for the sidebar active state + chart series; a loading spinner is neither. **Fixed → `var(--accent-interactive)`.** No repo precedent for teal-on-spinner (the only direct-teal uses are the sidebar active state, explicitly commented as the one allowed place).
- Manual checklist pass (DB + API + web) otherwise clean: access-gated on every path (403 never 404), parameterized SQL only, controllers thin, async + `CancellationToken` threaded, ProblemDetails errors, one-component-per-file with private sub-components, explicit loading/error/empty states, jest-axe across meaningful states.
- **Design-fidelity render & compare (frontend + handoff present):** **not executed locally.** The full prototype-vs-build screenshot audit requires standing up the app with seeded data (LocalDB schema via the migrations-runner) — the same DB standup that is CI-gated. The slice's visual delta is confined to the record-detail **Attachments tab**, built from established design-system primitives (`record-card`, `record-chip`, form fields, Button) with token conformance verified above.

### Phase 2 — Security review

- OWASP pass over the diff — clean:
  - **A01 Access control:** every read/write access-gated server-side (stored-proc membership join + `AccessGuard` Member+); forbidden/non-existent → 403, never 404; client-supplied ids never trusted; blob path server-allocated.
  - **A03 Injection:** all SQL parameterized via `SqlParameter`; no dynamic SQL.
  - **File-upload hardening:** content-type allowlist + 25 MB cap enforced before streaming; filename sanitized (`Path.GetFileName`); `LocalBlobStreamer` path-traversal guard; blob key is a server GUID, not client input.
  - **A08/A09:** SQL is the pointer authority; no PII / filenames logged (event payloads carry ids only); external-link opens use `noopener,noreferrer`.
  - **Secrets:** none introduced (blob account URI is non-secret; Managed Identity, no key).

### Developer decisions

- No architectural findings surfaced. One mechanical finding (spinner colour) auto-applied.

## Status

- **Local, runnable gates: PASS** (API build + 286/286 relevant API tests, 568/568 web tests, token conformance, manual code + security review; one mechanical fix applied).
- **CI-gated checks NOT run locally:** tSQLt execution, design-fidelity render-and-compare (both require the migrations-runner DB standup that is CI-only in this repo).
- **Pre-existing, out-of-scope:** `HealthTests` 500 (fails on base `dev` too).

**Cache not written** — the full design-fidelity phase (required when a handoff is present + frontend in scope) was not executed locally, so a `CLEAN` cache would misrepresent coverage. Escalated to the developer for a decision.
