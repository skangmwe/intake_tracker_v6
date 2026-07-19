# slice-multi-dashboard-composer — test failures / gaps

## Iteration 1
- **tSQLt not run (open, non-blocking):** the tSQLt framework is not vendored in the repo (only the tests are) — `test_DashboardComposer.sql` is authored but executes at a SQL-Server-with-tSQLt CI environment, per the project runbook Gotchas. Not a slice-28 defect; the same open gate applies to every DB slice.
- **jest:** one load-induced flake in `lifecycle/StagesEditor.test.tsx` (axe, untouched slice-4 file) on the first full run; passed in isolation and on the immediate re-run (1193/1193). Not a regression.
- No source test failures. Two source bugs surfaced by running the tests were fixed under remediations (see below).
