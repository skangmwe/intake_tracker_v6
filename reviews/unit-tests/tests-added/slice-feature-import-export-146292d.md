# slice-feature-import-export — tests added / extended

## Iteration 1

New:
- `api/Api.Tests/FeatureIoObjectTests.cs` — metadata (import/export field specs incl. required Name/Type),
  `BuildExportAsync` (projects rows + joins multi-value fields, null-when-not-a-hub-member, row cap,
  cancellation), `ImportRowAsync` (success lands, missing-required flags without creating, denied → flagged).

Extended:
- `api/Api.Tests/RequestIoObjectTests.cs` — constructor now takes `AppDbContext` (dummy connection, no-DB
  branches only, matching TypedLinksServiceTests); `BuildExportAsync` calls carry `userId`; added
  `ImportRowAsync` cases (no-requestor lands, validation-fails flags, denied flags).
- `api/Api.Tests/ExportServiceTests.cs` — mock signature updated for the new `BuildExportAsync(userId)`;
  added `ExportObjectAsync_DescriptorDeniesAccess_ReturnsDenied` (null dataset → 403).
- `web/src/features/import-export/components/ExportWizard.test.tsx` — Feature lights up from the catalog,
  exports Feature columns (axe on the Feature fields step).
- `web/src/features/import-export/components/ImportWizard.test.tsx` — Feature lights up, its fields drive the
  mapper ("Type" → featureType), flow reaches the run step.
- `web/e2e/import-export.spec.ts` — Feature added to the io/objects mock + an `/exports/object` route;
  asserts Feature surfaces in the export wizard's object picker.

Results: API `dotnet test` **739/739**; web `test:coverage` **1485/1485** (255 suites, ≥80% thresholds met).
