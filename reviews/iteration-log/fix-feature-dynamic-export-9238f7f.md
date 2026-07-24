# fix-feature-dynamic-export-9238f7f — iteration log

**Label:** fix-feature-dynamic-export-9238f7f
**Scope source:** uncommitted working tree (worktree off dev @ 9238f7f)
**Final status:** CLEAN

## Iteration 1 — 0 code findings, 0 security findings

- Phase 0 (unit tests): full API suite — 763 passed, 0 failed. Reworked `FeatureIoObjectTests` for the
  dynamic model (catalog-derived columns + FieldValues projection + null→403 for non-hub-members), and
  the `RequestIoObject` refactor to the shared `FieldValuesProjector` is covered by its existing
  projection test (behaviour unchanged). The shared projector is exercised through both callers'
  tests (Request covers string/bool/array/int64; Feature covers string/array). New tSQLt
  `test_usp_GetFeaturesForWorkspace` authored to the FakeTable/AAA pattern; not run locally (no local
  tSQLt runner — runs via CI). Migration 076 + the proc were applied/smoke-run on LocalDB: the Feature
  catalog now surfaces 14 fields (export id + 14 = 15 columns, was 10), the bulk read returns RecordId +
  FieldValues, and the migration is idempotent (re-apply → still 14 rows).
- Phase 1 (code review): CLEAN — see code-review-findings.
- Phase 2 (security review): CLEAN — see security-review-findings.
- Design-conformance / design-fidelity: N/A — backend-only change, no frontend files in scope.
- Auto-applied: none. Architectural surfaced: none — the workspace-aware `GetExportFieldsAsync`
  contract (shipped in 3a) and the two-ship Feature split were pre-approved by the developer.

## Final Status: CLEAN
- Total iterations: 1
- Total findings fixed: 0
