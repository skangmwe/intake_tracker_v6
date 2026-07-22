# slice-import-export-wizards — remediations applied

## Iteration 1
- Phase: 1 — [component-length] Extracted `ImportPreviewTable` from `ImportWizard.tsx` (236→206 lines) + added `ImportPreviewTable.test.tsx` (render/truncation/unnamed/axe). Re-ran import-export jest: 68 pass, tsc clean.
- Phase: 1 — [landmark-unique / a11y] E2E (full-page render) surfaced a duplicate `id="ie-export-heading"` shared by ExportWizard and the retained ExportPanel on the Export tab (two `<section>` landmarks with the same accessible name; also a duplicate-id HTML error). **Fixed** — ExportWizard heading id → `ie-export-wizard-heading`. Jest tested the two components in isolation so it did not catch the collision; the e2e did. Re-ran e2e (pass) + import-export jest (68 pass).
