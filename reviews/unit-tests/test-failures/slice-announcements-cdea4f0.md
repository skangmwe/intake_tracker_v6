# slice-announcements-cdea4f0 — test failures / gaps

## Iteration 1

### No failures attributable to this slice
- **Web:** 651/651 pass. Global branch coverage 79.97% — within the documented [78%, 80%) acceptance band; every required behaviour case is covered and the feature is 90–96% covered. Justification per `web-testing.md`: only the pre-existing app-wide branch total sits fractionally under 80%; no filler tests added.
- **API:** `HealthTests.Health_returns200_withStatusOk` fails (`500` vs `200`) — **pre-existing**, reproduces identically on base `dev`; the health endpoint is not in this slice's diff, and every other `WebApplicationFactory`-based test (including the new announcement endpoints) passes, proving app startup is unaffected. Not a slice defect.

### Pre-existing `tsc --noEmit` (strict) noise (jest/babel unaffected)
- `attachments/api.test.ts`, `gates/gateView.test.ts`, and the record-less `BellMenu.test.tsx` fixture carry `exactOptionalPropertyTypes` strictness errors from slices 11/12. Every file authored in this slice type-checks clean.
