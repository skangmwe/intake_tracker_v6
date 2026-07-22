# slice-import-export-wizards — code review findings

## Iteration 1
Scope: api/Api/Modules/ImportExport/* (registry, Request descriptor, generic CSV writer, mapping-driven import, object-export endpoint), Program.cs DI, shared/types/imports.ts, web/src/features/import-export/* (tabs page, Import/Export wizards, sub-widgets, csvPreview + importMapping utils, api/hooks), web/src/setupTests.ts, web/src/shared/constants.ts.

Checklists applied: api-middletier.md, web-frontend.md.

Findings:
- [Mechanical/Low] ImportWizard.tsx was 236 lines (> 200-line component guideline, web-component-architecture.md#component-length). **Fixed** — extracted `ImportPreviewTable` into its own component + test; ImportWizard now 206 lines (body ~177). Applied in Iteration 1.

No other findings. Verified: CancellationToken threaded through every new async method; controllers route/validate/authorize only (mapping validation is boundary validation per api-validation.md); ownership 403-never-404 (ExportObject Denied→403, unknown→400); ProblemDetails on all error paths; no PII/CSV values logged; no new raw SQL; enums/objectType travel as validated strings; no `any`; no floating promises (async file handler `void`-wrapped); data-ds on new DS components; three non-data states on data-loading wizards; jest-axe per state.

## Final: CLEAN (1 mechanical fix applied)

## Iteration 1 (addendum — e2e-surfaced)
- [Mechanical/Moderate] `landmark-unique` (accessibility.md): ExportWizard and ExportPanel shared `id="ie-export-heading"` on the Export tab → two landmarks with identical accessible name + duplicate id. **Fixed** — renamed the wizard heading id to `ie-export-wizard-heading`. Surfaced by the updated Playwright e2e (`e2e/import-export.spec.ts`) which axe-scans the full `.import-export-page`; the isolated jest-axe tests could not see the cross-component collision.
