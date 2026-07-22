# fix-rename-standard-delivery-ca68ddd — iteration log

**Label:** fix-rename-standard-delivery-ca68ddd
**Scope source:** uncommitted diff on branch `fix/rename-standard-delivery` (base `dev` @ ca68ddd)
**Change:** Rename the seeded default lifecycle Name "Standard AI build" → "Standard delivery".
**Started / Ended:** 2026-07-22 (single iteration)
**Final status:** CLEAN

## Scope
- `database/migrations/20260721_074_RenameDefaultLifecycleToStandardDelivery.sql` (+ rollback) — NEW. Forward data migration, GUID-targeted (`11FE0000-…-000000000001`), idempotent, guarded on the current Name. Historical seed (028) untouched, per the 067/072 pattern.
- 14 fixture files — literal-only swap `Standard AI build` → `Standard delivery`, fixture↔assertion pairs kept in sync (5 api test `.cs`, 2 db tSQLt `.sql`, 3 web test `.ts(x)`, 3 e2e `.spec.ts`, 1 `shared/types/requests.ts` comment).

## Phase 0 — unit tests
- **web jest** (`StatusSummaryRow`, `RecordDetailPage`): **24/24 pass**.
- **api dotnet** (`Closure`/`Copy`/`Escalation`/`RequestsController`/`TypedLinks` tests): **40/40 pass**.
- **db tSQLt** (`test_Escalation`, `test_usp_SaveLifecycleConfig`): could not run — **pre-existing** repo-wide non-compiling assertion pattern `EXEC tSQLt.AssertEquals @Actual=(SELECT …)` (`Msg 102 — Incorrect syntax near '('`), ~206 occurrences repo-wide, on the assertion lines (not the fixture lines this change touched). Not a regression from this diff; out of scope to remediate (see `unit-tests/test-failures/`). Migration 074 verified directly against LocalDB instead (apply → idempotent re-run → rollback round-trip → re-apply).

## Phase 1 — code review + design
- Migration 074: idempotent (`IF NOT EXISTS` history guard + Name guard), rollback present + idempotent, header comment, single logical change, data migration separate from schema, WHERE guard present. Conforms to `database-coding-standards.md` + `database-migrations.md`.
- Fixture edits: pure literal swaps, no logic change (verified via `git diff -U0`).
- Design-conformance token scan (`check-design-conformance.sh --web-required`): PASS (diff adds no CSS/inline styles).
- Design-fidelity render & compare: all 22 Prototype-tagged screens carry blank App-route in the blueprint → out-of-scope `not-implemented` (render-exempt); APP + SHELL `match` (diff changes no rendered source; committed shots remain accurate). `verify-design-fidelity-manifest.mjs` → **MANIFEST: VALID**.

## Phase 2 — security review
- No new attack surface. No secrets, no dynamic SQL (migration uses literal + parameterless guarded UPDATE against a fixed GUID), no PII, no auth change. Pre-existing dependency advisory NU1903 (`System.Security.Cryptography.Xml`) surfaced in the api test build — pre-existing, not introduced here.

## Architectural findings
None.

## Final Status: CLEAN
- Iterations: 1
- Findings fixed: 0 (no new findings)
- Deferred/rejected: 0
