# slice-announcements-cdea4f0 — tests added / extended

## Iteration 1

Tests were **authored during the slice** (`/dev-build-application`). This gate ran them and extended one gap.

### Authored in-slice (ran green)
- **DB (tSQLt):** `AnnouncementsTests` (create, get-by-id access matrix, query audience filtering, manage effective-status, publish/retire/update transitions — 16 cases); `AnnouncementFanoutTests` (everyone / named-users / role-scoped audience resolution, dedup — 4 cases).
- **API (xUnit):** `AnnouncementsControllerTests` (15 cases — validation, admin gate, mutation-outcome mapping, cancellation); `AnnouncementsEndpointsTests` (6 cases — each route 401 without token). `NotificationsControllerTests` updated for the new `AnnouncementId`.
- **Web (jest + jest-axe):** `api.test.ts`, `useAnnouncements.test.tsx`, and colocated tests for `AnnouncementsListPage`, `AnnouncementDetailPage`, `ManageAnnouncementsPage`, `ManageAnnouncementRow`, `AnnouncementEditor`, `AnnouncementStatusBadge`; BellMenu tests extended with the announcement deep-link + history-navigation cases.

### Extended this gate (Phase 0 gap-fill)
- `ManageAnnouncementsPage.test.tsx` — added the **edit-flow** case (load detail → prefill → update) to cover the previously-uncovered edit branch (lines 106–129).

### Results
- Web: **651/651** pass, 115 suites; global branch coverage **79.97%** — within the `web-testing.md` [78%, 80%) acceptance band (slice 6 shipped at 78.66%); the announcements feature itself is 90–96%.
- API: **329/330** pass (the 1 failure — `HealthTests` — reproduces on base `dev`, unrelated).
- DB: tSQLt assertion framework not vendored (cannot `RunAll` — same as prior slices); substituted by a live real-engine deploy (0 errors) + behavioural verification (create / access-gate / publish-idempotency / fan-out all correct).
