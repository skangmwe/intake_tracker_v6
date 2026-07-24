# fix-request-dynamic-export-061b2a1 — iteration log

**Label:** fix-request-dynamic-export-061b2a1
**Scope source:** uncommitted working tree (worktree off dev @ 061b2a1)
**Final status:** CLEAN

## Iteration 1 — 0 code findings, 0 security findings

- Phase 0 (unit tests): full API suite — 762 passed, 0 failed. Reworked `RequestIoObjectTests` for the
  dynamic model (catalog-derived columns + FieldValues projection: string / bool→Yes/No / array→joined
  / int64-preserving number), and updated the 6 other IoObject/Export/Controller tests for the
  `GetExportFieldsAsync` contract. A real bug was surfaced by the projection test and fixed: the
  number-formatting ternary was widening every integer to `double` (int64 precision loss) — cast the
  integer branch to `object`. New tSQLt `test_usp_GetRequestsForWorkspace` authored to the FakeTable/AAA
  pattern (workspace scope, soft-delete exclusion, pagination); not run locally (no local tSQLt runner —
  project-wide standing condition; runs via CI). The new proc + the catalog read were applied/smoke-run
  on LocalDB: the bulk read returns RecordId + FieldValues per request, and the Request catalog surfaces
  46 non-retired columns (so the export goes from 9 → 47, all catalog-sourced).
- Phase 1 (code review): CLEAN — see code-review-findings.
- Phase 2 (security review): CLEAN — see security-review-findings.
- Design-conformance / design-fidelity: N/A — backend-only change, no frontend files in scope.
- Auto-applied: the int64-precision fix (surfaced by a unit test). Architectural surfaced: none — the
  workspace-aware `IIoObject` contract change was pre-approved by the developer (AskUserQuestion:
  "fully dynamic per-workspace").

## Final Status: CLEAN
- Total iterations: 1
- Total findings fixed: 1 (int64-precision, test-surfaced)
