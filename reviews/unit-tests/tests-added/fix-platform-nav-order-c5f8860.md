# Unit tests added/extended — fix-platform-nav-order-c5f8860

## Iteration 1

None added or extended.

The change is a data reorder of `PLATFORM_NAV` plus one route-string change. Existing coverage is
sufficient:

- `web/src/features/platform-admin/components/PlatformLayout.test.tsx` — asserts the surface-list
  link count (6, unchanged) and active-state by route; both order-independent and still green.
- `web/src/App.test.tsx` — route table coverage; green.

`jest PlatformLayout src/App.test` → 2 suites / 9 tests pass. No required test case per web-testing.md
is missing for a nav-order/route change.
