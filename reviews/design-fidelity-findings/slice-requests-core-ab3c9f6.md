# slice-requests-core-ab3c9f6 — design-fidelity findings

**Method:** stood up the full stack locally against real SQL — deployed the schema (31 migrations + 32 procs) to LocalDB `IntakeTrackerDev`, seeded 6 deterministic requests + a dev user/membership, booted the API (`:5080`, dev-bypass auth) + web dev server (`:5173`), and headless-rendered the built prototyped screens for this slice against their prototype spec. Stack torn down after; ports freed. Dev config (`appsettings.Development.json`) is gitignored — not shipped.

## Iteration 1

### Screens compared (built by slice 5 / earlier slices)

| Screen | Route | Verdict | Notes |
|---|---|---|---|
| **S2 Requests list** | `/requests` | **match** | Lockup + grouped sidebar + workspace switcher; view bar (saved-view picker + Export view + Create request); full items-grid with funnel filters, 6 records, mono IDs, per-column layout; **aging tint** correctly pale-orange on the past-due row; pagination footer. Renders faithfully. |
| **S3 Intake form** | `/requests/new` | **match** | "New request" title; two-column with sticky Similar-requests panel (correct empty-state copy); numbered section markers; data-driven "Request type" lifecycle select with exact hint; required Name + optional-marked fields; two-column pairing; "Value mapping" section follows. |
| **S4 Record detail** | `/requests/AIS-00000001` | **match (after fix)** | Breadcrumb; mono ID + serif name; 4-field meta strip; **compact 6-step lifecycle stepper as circles on a continuous track** (not bordered rectangles); 6 tabs (Intake active); editable data-driven Intake tab seeded from the record. |
| SHELL | app frame | **match** | Navy sidebar, top bar, theme toggle, account menu — consistent across screens. |

### Bugs caught by the real-stack render (both fixed this run)

1. **[Critical → fixed] DB — `Requests.DueDate` non-deterministic PERSISTED computed column.** `TRY_CONVERT(DATE, JSON_VALUE(...))` (even with style 23) cannot be PERSISTED — SQL Server rejects it as non-deterministic, so `CREATE TABLE dbo.Requests` failed on a real deploy. The FakeTable-based tSQLt tests could not surface this (FakeTable drops computed columns). **Fix:** made `DueDate` a non-persisted computed column and dropped it from the covering index INCLUDE (migration `20260704_029`). Verified by full re-deploy + an end-to-end proc smoke test (`usp_CreateRequest` → `usp_QueryRequests` → correct computed columns).
2. **[Medium → fixed] Web — S4 meta-strip due-date off-by-one.** `formatDayMonth` used `new Date('2026-07-16')`, which parses as UTC midnight and renders one day earlier in negative-offset timezones — the meta strip showed **"Jul 15"** for a 2026-07-16 due date. **Fix:** parse date-only ISO strings as local (`RecordDetailPage.tsx`). Re-render confirmed **"Jul 16"**; RecordDetailPage tests 10/10 pass; tsc clean.

### Screens NOT built yet (future slices) — blocking for a whole-app CLEAN

| Screen | Owning slice | Verdict |
|---|---|---|
| **S1 Home** | 22 | `not-implemented` (route renders the placeholder) |
| **S5 Escalated record** | 9 | `not-implemented` |
| **S6 AI dashboard** | 23 | `not-implemented` |

These are **expected** at slice 5 — they are not slice-5 defects. But the design-fidelity evidence manifest must cover **every** Prototype-tagged screen, and three render as placeholders, so a valid CLEAN manifest is **structurally impossible until those slices land**. This is a property of running the whole-app design-fidelity gate mid-build, not a quality gap in slice 5.

## Result

All screens slice 5 built (**S2, S3, S4**) + SHELL render **faithfully** to the prototype; two real bugs were caught by the real-stack render and **fixed**. Status stays **UNRESOLVED (structural)** because S1/S5/S6 are future-slice `not-implemented` — no valid CLEAN cache is written, so `/dev-ship` correctly stays paused.
