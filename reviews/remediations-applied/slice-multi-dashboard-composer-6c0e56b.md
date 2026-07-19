# slice-multi-dashboard-composer — remediations applied

## Iteration 1
| # | Phase | Class | File | Fix |
|---|---|---|---|---|
| 1 | 0 | Mechanical (source bug — DB) | `migrations/20260719_063_...AddComposerColumns.sql` | **Real bug caught by the live DB apply:** the `ADD Visibility` column and the `ADD CONSTRAINT CK…CHECK(Visibility…)` were in one batch → same-batch column-resolution error → transaction rolled back → all composer columns/procs failed to apply. Restructured to GO-separated `IF NOT EXISTS … BEGIN ALTER … END; GO` batches (mirrors migration 060). Re-applied: 64 migrations, 145 procs, **0 failures**. |
| 2 | 0 | Mechanical (test bug) | `ComposedDashboardSurface.test.tsx` | Reorder assertion used `getByRole('Move widget up')` with 2 widgets (2 matches) → fixed to `getAllByRole(...)[0]` + last-down disabled. |
| 3 | 0 | Mechanical (source — tsc) | `dashboards.ts`, `NewDashboardSheet.tsx` | `DashboardComposeRequest.audience` made optional (create endpoint ignores it; visibility governs list) so the New-dashboard sheet compiles. |
| 4 | 0 | Mechanical (source — tsc) | `BarBreakdownWidget.tsx` | `barColor`/`drillFor` widened to `DashboardMetric \| undefined` (composed bar widgets carry no fixed metric). |
| 5 | 0 | Mechanical (source — tsc) | `composerModel.ts` | `request.id = draft.id as WidgetId` (was `as WidgetComposeRequest['id']`, which is `WidgetId \| undefined` — rejected under exactOptionalPropertyTypes). |
| 6 | 1 | Mechanical (lint) | `DashboardsManagementSection.tsx` | Removed a pre-existing unused `problemMessage` import (file brought into scope by the S32 Personal-filter change). |
| 7 | 1 | Mechanical (design-fidelity) | `DashboardSwitcher.tsx` + `dashboards.css` | **missing-element** vs prototype: the switcher header lacked the owner/meta line ("Default · Shared"). Added `.dash-switcher__meta`. Re-rendered → matches. |
| 8 | 1 | Mechanical (format) | 24 web files | `prettier --write` (formatting only). |
