# slice-global-object-local-fields-d17ed1c — iteration log

**Label:** slice-global-object-local-fields-d17ed1c
**Scope source:** uncommitted working tree (SP3b Slice 2b — per-workspace local field extensions on Global objects)
**Files reviewed:** 5 (2 source, 3 test)
- `api/Api/Modules/Fields/FieldSchemaService.cs` (API — source)
- `database/procedures/fields/usp_UpsertFieldDefinition.sql` (DB — source)
- `database/tests/fields/test_usp_UpsertFieldDefinition_GlobalLocalCollision.sql` (DB — test)
- `web/src/features/fields/components/FieldObjectAndLocationFields.test.tsx` (Web — test)
- `web/src/features/fields/components/FieldsCatalogTab.test.tsx` (Web — test)
**Layers in scope:** API + Database. Frontend files in scope are **test-only** (no component/style/screen changed).
**Started:** 2026-07-27T02:40:00Z
**Ended:** 2026-07-27T02:47:00Z
**Final status:** CLEAN

## Iteration 1 — 0 code findings, 0 security findings, 0 design-fidelity findings

### Phase 0 — unit tests
- **Web (jest):** `FieldObjectAndLocationFields.test.tsx` + `FieldsCatalogTab.test.tsx` → **14 passed / 14** (includes the 3 new characterization tests proving a Global custom object is offered as a New-field target and that a custom object forces `LocalWorkspace` + disables Location).
- **API (xUnit):** `dotnet test --filter "FullyQualifiedName~Field|FullyQualifiedName~PlatformSchema"` → **177 passed / 177** (the `SqlException 50011 → Conflict` catch compiles and no existing Field/PlatformSchema test regressed).
- **Database (tSQLt):** `FieldsGlobalLocalCollisionTests` (4 cases) authored. tSQLt runs **CI-only** in this environment (cannot execute locally); red/green is confirmed by CI on deploy. Cases: collision workspace→Global (throws 50011), collision platform→workspace (throws 50011), different-key coexist + re-save no-trip, workspace-authored Global field on the Request built-in still upserts (guard no-op on built-ins).
- **Gap-fill:** none. Per the locked plan (Task 2), no net-new xUnit for the catch branch — `SqlException` has no public constructor, so a fake-`DbContext` unit test cannot exercise the branch; coverage is the tSQLt proc-throw + the existing controller `Conflict → 409` unit tests + the authenticated LocalDB round-trip at CI. Recorded as a deliberate decision, not a gap.

### Phase 1 — code review
- Design-conformance gate (`check-design-conformance.sh --web-required`): repo-wide **PASS** (see design-fidelity note below). The 2 changed `.test.tsx` files contain no raw colours, no colour functions on styling lines, and no `border-radius` literals; no `.css`/`.scss` in the changed set — zero off-token values introduced.
- Design-fidelity render-and-compare: **not run** (`design-fidelity-web` NOT in `phases_run`). The only frontend files in scope are test files — no rendered screen, component, or style changed — so there is no visual delta to compare against the prototype. Consistent with this project's DB/API/test-only slice pattern.
- Checklist review (api-middletier, database-backend, web-frontend): **0 findings**.
  - `FieldSchemaService.cs`: named const `GlobalLocalKeyCollisionError` (no magic number); exception **filter** `when (ex.Number == …)` so unrelated `SqlException`s propagate; maps to `Conflict → 409`; no internal error text leaked; `CancellationToken`/`ConfigureAwait(false)` preserved. The DB-raised guard is converted to a result at the EF boundary (mirrors the existing `THROW 50010` handling — not exceptions-as-control-flow).
  - `usp_UpsertFieldDefinition.sql`: fully parameterized locals, no dynamic SQL; `THROW` (not `RAISERROR`); inside the existing TRY/TRANSACTION under `XACT_ABORT ON` with rollback; `EXISTS` filters `IsDeleted=0`, SARGable; emits no result set; header comment updated; guard placed after `@FieldDefinitionId` resolution so a legitimate re-save never trips it.
  - Tests follow `database-testing.md` (AAA + FakeTable + ExpectException) and `web-testing.md` (AAA + role/label queries + jest-axe).

### Phase 2 — security review
- OWASP A01–A10 + data-protection: **0 findings introduced by this slice**.
  - A03 injection: guard fully parameterized; no dynamic SQL. A01/A04: no new access path — the guard *closes* a cross-namespace `(ObjectType, FieldKey)` data-corruption hole (net security improvement); ownership/platform gates unchanged. A09: no new logging; no PII/secrets; generic 409 message. Error handling: `SqlException → Conflict`, never rethrown as 500, no stack trace exposed. No dependencies added.
- **Out-of-scope observation (non-blocking, not introduced by this slice):** `dotnet test` restore surfaced `NU1903` — `System.Security.Cryptography.Xml 10.0.7` transitive advisory in `Api.Tests`. Pre-existing on `dev`; this slice touches no `.csproj`/dependencies. Flagged for a dedicated dependency-bump, out of this slice's scope.

- Auto-applied: none (zero mechanical findings).
- Architectural surfaced: none.
- Developer decisions: none required.
- End-of-iteration open set: {} (empty)

## Final Status: CLEAN
- Total iterations: 1
- Total findings fixed: 0
- Architectural deferred: 0
- Architectural rejected: 0
