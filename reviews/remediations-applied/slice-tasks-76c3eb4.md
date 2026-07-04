# slice-tasks-76c3eb4 — remediations applied

## Iteration 1

- **Phase: 0** (test bug) — `web/src/features/tasks/TasksTab.test.tsx`: `getByText('Repo URL')` was ambiguous (the composer field-picker lists "Repo URL" as an option); scoped the assertion to `.task-field__label`. Re-ran TasksTab suite: 13/13 pass.
- **Phase: 0** (coverage gap) — added `TaskRow.test.tsx` (13 cases covering every typed-field kind + states), `useTasks` disabled-key cases, and two `RequestsListPage` RepoCell cases. Global branch 77.31% → 79.05% (documented [78,80) band; tasks feature 82.8%).
- **Phase: 0** (source bug, DB) — `database/procedures/tasks/usp_CreateTask.sql` + `usp_ApplyTaskBundle.sql`: the SortOrder-sequence subquery filters `IsDeleted = 0`, but the INSERTs relied on the column DEFAULT, so a freshly-created task had `IsDeleted` unset under the tSQLt fake and the next task's `MAX(SortOrder)` skipped it (both got SortOrder 1). Set `IsDeleted = 0` explicitly in both INSERTs. Production-correct either way; makes the filter dependency explicit. Re-ran TasksTests: 11/11 pass.
- **Phase: 1** (code-quality, react/jsx-key) — `web/src/features/requests/components/RequestsListPage.tsx`: added stable `key` props to the JSX cell elements in `toTableRow` (pre-existing + the new RepoCell). ESLint clean.
- **Incidental** (tsc) — `web/src/shared/text/mentions.ts`: guarded `match[1]` (pre-existing strict-mode error surfaced by the edit-time tsc; the automated gate runs jest/eslint, not tsc). Behavior unchanged.
