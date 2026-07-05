# slice/closure-copy-links — iteration log

**Label:** slice-closure-copy-links
**Scope source:** uncommitted working tree (slice 10)
**Started:** 2026-07-05T03:20:00Z
**Ended:** 2026-07-05T03:47:05Z
**Final status:** NEAR-CLEAN — every executable check passes; the sole un-run check is the full
design-fidelity render/compare (requires the whole app stack seeded + a per-component visual diff),
which is infeasible to complete to the skill's standard in this session. No CLEAN cache written.

## Update — attempted stand-up (option C), gaps closed
LocalDB (`MSSQLLocalDB`) + `Invoke-Sqlcmd` + chrome/edge turned out to be available; only `sqlcmd`
and the SQL Server 2022 CLR container (for the formal tSQLt harness) are absent. With that:
- **API integration (`*Endpoints`) tests now run and pass — 30/30.** The suites inject the `AzureAd`
  config so the host boots (no `IDW10106`) and assert 401-without-token gating (no DB needed).
  Authored the missing ones to close the API-endpoint tier gap: `ClosureEndpointsTests`,
  `TypedLinksEndpointsTests` (4 routes), and a promote-to-request case on `TasksEndpointsTests`.
- **SQL proc logic verified against real LocalDB — 14/14** (`scratchpad/slice10-sql-smoke.ps1`): the
  actual `usp_CreateTypedLink` / `usp_GetTypedLinksForRecord` / `usp_DeleteTypedLink` /
  `usp_CloseRequest` bodies + migration 038 applied to a fresh DB, exercising create + all guards
  (self / missing-target / duplicate-family), access-respecting far-name hiding, membership-gated
  soft-delete, and close-into-FieldValues + not-found. This is the tSQLt-equivalent verification
  against a real engine (the formal tSQLt CLR harness still runs in CI).
- **`HealthTests` failure diagnosed as pre-existing**, not slice 10: it uses a *bare*
  `WebApplicationFactory<Program>` that doesn't inject `AzureAd:ClientId`, so it 500s only when the
  machine's ambient config lacks a ClientId. Every other API test (which injects the config) passes.

### Remaining un-run check
- **Design-fidelity render & compare** — still not executed. Requires standing up the full app (all 38
  migrations + procedures + seed on LocalDB, API + web dev server, dev auth-bypass) and a rigorous
  per-component / per-interaction-state visual diff of the prototyped screens. Slice 10's prototyped UI
  is incremental (the Relationships card + Close-record card added to the S4/S5 record-detail Status
  tab; S19 Copy modal is `[deferred]`, not prototyped). Recorded as the one open item.

---
## Original iteration record


## Iteration 1

### Phase 0 — Unit tests
- **Web (jest):** ran the full suite — **538/538 pass across 99 suites** after remediation.
  - Fixed (Mechanical, source): `CloseRecordModal` disabled its primary button while the Duplicate
    target was missing, making the on-submit validation error unreachable and violating
    `forms-and-input.md` ("don't disable submit until valid"). Removed `duplicateMissing` from the
    disabled condition — the error now surfaces on submit.
  - Fixed (Mechanical, test): `RelationshipsCard` Copy-record test was ambiguous under suite-wide DOM
    accumulation; scoped the query to the render's own container (`within(container)`) and awaited the
    mutation-driven async in the remove/add tests so nothing is pending at teardown.
- **API (dotnet):** project **compiles cleanly (0 errors, 0 warnings)**. **21 new unit tests pass**
  (Closure / Copy / TypedLinks branches + BuildQueuedLinksJson / MapOutcome pure helpers). Full
  non-integration run: **227/228 pass**. The 1 failure — `HealthTests` (`WebApplicationFactory` boot) —
  fails with `IDW10106: The 'ClientId' option must be provided` inside `CacheControlMiddleware` (a
  `Microsoft.Identity.Web` config error). That middleware and the auth config are **not in this slice's
  diff**; the failure is a pre-existing environment gap (no Entra `ClientId` configured for the test
  host), independent of slice 10.
- **Database (tSQLt):** authored (`test_TypedLinks.sql`, `test_Closure.sql`) but **NOT EXECUTED** — no
  SQL Server / `sqlcmd` available in this session.

### Phase 1 — Code review
- **Design-conformance token gate:** verified directly — every colour / radius in the new/changed
  component styles (`Modal.css`, `closure.css`, `typedLinks.css`, `tasks.css`) is a `var(--…)` token;
  no raw hex / rgb / hsl / named colours, no off-spec radii, no inline styles. **PASS.**
- **Design-fidelity render & compare:** **COULD NOT RUN.** A design handoff is present, so this is a
  required check — but the app cannot boot in this session (same `IDW10106` Entra-config error), and no
  SQL Server is available for the data layer, so the local full-stack stand-up + per-screen render is
  not executable here. Per the skill this is a blocking OPEN finding (`design-fidelity-web.md#render-failed`).
- **Manual code review** (api-middletier / web-frontend / database-backend checklists): all record-scoped
  reads/writes gate through `usp_GetRequestByIdForUser` / membership joins (403 never 404); every raw
  SQL call is parameterised (`SqlParameter`, no interpolation/concat); `CancellationToken` threaded
  throughout; event payloads carry ids/kinds only (no PII); soft-delete + six audit columns + FK indexes
  on `TypedLinks`; web components render loading/error/empty; components under the 200-line ceiling;
  focus-trap effects clean up. **No new High/Medium findings.**

### Phase 2 — Security review
- OWASP walk of the diff: A01 (access control) enforced server-side on every path incl. Copy target
  gate and membership-gated link delete; A03 (injection) — parameterised SQL throughout; no secrets, no
  new external calls, no PII in logs/errors; `includeAttachments` no-op does not widen access. **No
  findings.**

## Why no CLEAN cache was written
Required infra-dependent gate checks — the **design-fidelity render/compare**, **tSQLt**, and the
**API integration (`*Endpoints`) tests** — cannot execute in this session (no SQL Server, no Entra
`ClientId` config, app won't boot). Per the firm rule, a CLEAN cache is never written from partial
work. Code-level verification (tsc, web unit tests, C# compile + unit tests, token discipline, manual
code + security review) is complete and green; the gap is purely the environment's missing
infrastructure, not a defect in the slice.
