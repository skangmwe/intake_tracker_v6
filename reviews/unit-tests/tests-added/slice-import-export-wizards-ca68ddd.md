# slice-import-export-wizards — tests added/extended

## Iteration 1
API (new): `RequestIoObjectTests` (metadata + export projection + row-cap + cancellation), `IoObjectRegistryTests` (find/all/order); extended `ImportExportControllerTests` (io/objects 403+list, ExportObject success/denied/unsupported/empty-objectType, ImportCsv unknown-object/invalid-mapping/valid-mapping-passthrough), `ExportServiceTests` (ExportObjectAsync unknown/denied/unknown-field/happy/identity-only), `CsvRowMapperTests` (MapFromMapping routing/skip/first-wins), `CsvExportWriterTests` (WriteDataset render/escape/neutralize).
Web (new): `csvPreview.test.ts`, `importMapping.test.ts`, `ExportFieldPicker.test.tsx`, `ImportColumnMapper.test.tsx`, `ExportWizard.test.tsx`, `ImportWizard.test.tsx`, `ImportRunStep.test.tsx`, `ImportPreviewTable.test.tsx`; extended `api.test.ts`, `useImportExport.test.tsx`; rewrote `ImportExportPage.test.tsx` (tabs). jest-axe across loading/error/empty/interaction states.
Result: API 63 import-export tests pass; Web 68 import-export tests pass (full web suite 1465 pass). Branch coverage 79.93% (within tolerated [78,80); pre-existing project level, not introduced by this slice).
