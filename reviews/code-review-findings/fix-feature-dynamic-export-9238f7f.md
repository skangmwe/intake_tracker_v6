# fix-feature-dynamic-export-9238f7f — code-review findings

**Scope:** database (migration 076 Feature schema seed + rollback, `usp_GetFeaturesForWorkspace` +
tSQLt) + api (`FeatureIoObject` dynamic export, `IFeaturesService` reads, `WorkspaceFeatureExportRow`
entity, `FeatureExportField` DTO, shared `FieldValuesProjector`, `RequestIoObject` refactor to the
shared projector, `FeatureIoObjectTests`).
**Checklists:** database-backend.md, api-middletier.md.

## Iteration 1 — 0 findings

- **Migration 076** (Feature schema seed): data migration, idempotent (`NOT EXISTS` guard keyed on
  ObjectType+FieldKey+Location+WorkspaceId), has an idempotent rollback, one logical change, header
  comment, no secrets. All 14 `FieldType` values are in the CHECK-constraint catalog. Verified
  idempotent on LocalDB (re-apply → still 14 rows). Seeded on the AI Solutions hub with
  Location='LocalWorkspace'/Category='WorkspaceLocal' — the same shape as the hub's Request fields.
  No finding.
- **`usp_GetFeaturesForWorkspace`**: `SET NOCOUNT/XACT_ABORT ON`, `CREATE OR ALTER`, schema-qualified,
  explicit columns, parameterized, `OFFSET/FETCH`, `IsDeleted = 0` filter, read-only. Mirrors the
  shipped `usp_GetRequestsForWorkspace`. Not an access-gate proc by design — hub membership is gated in
  FeaturesService. No finding.
- **`FieldValuesProjector`** (new shared helper): extracted from `RequestIoObject` now that Feature is
  the second caller (api/CLAUDE.md — inline until a real second caller exists; it now does). Pure,
  disposes the `JsonDocument`, materialises values before disposal, int64-safe (integer branch cast to
  `object`). `RequestIoObject` refactored to call it — projection behaviour unchanged (covered by its
  existing tests). No finding.
- **`FeaturesService` reads**: `FromSqlRaw` + `SqlParameter`, `ct`, `ConfigureAwait`. Both resolve the
  hub via the existing `ResolveHubWorkspaceIdAsync`; `QueryFeatureExportAsync` gates hub Viewer
  membership exactly like `QueryAsync` (null → 403). No cycle: the catalog read uses FeaturesService's
  own `_db`, not `FieldSchemaService`. No finding.
- **`FeatureIoObject`**: async, `ct` threaded, `ConfigureAwait`, `MaxExportRows` cap, paging, null →
  403 for non-hub-members. Columns derived from the hub catalog (same read as the Fields tab → cannot
  drift); values from `FieldValues` via the shared projector. Import path unchanged. No finding.
- **Note (not a finding):** as in Request 3a, `BuildExportAsync` re-reads the catalog that
  `ExportService` already read for validation. Export is a user-initiated download; acceptable and
  consistent with the sibling descriptor.

**End-of-iteration open set:** empty.

## Final Status: CLEAN
