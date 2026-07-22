# slice-platform-fields-objects-b2-4841199 — test failures / coverage gaps

## Iteration 1

No test failures. No required-case gaps.

- API: 710 passed / 0 failed.
- Web: 1461 passed / 0 failed; project branches 79.93% (within tolerated [78,80) per `web-testing.md`).

Pre-existing `tsc --noEmit` errors in unrelated files (`web/src/features/audit`, `web/src/features/relationships`) are on `dev` before this slice and are out of scope; none of the files this slice added or changed produce a tsc error.
