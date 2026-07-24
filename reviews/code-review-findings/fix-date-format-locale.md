# fix-date-format-locale — code review

**Scope:** frontend-only. New shared util `web/src/shared/utils/dateFormat.ts` (+test) and 28 call sites
routed through it. Layer checklists: `web-frontend.md`.

## Iteration 1 — 0 findings

- **Design conformance:** PASS — `check-design-conformance.sh --web-required`, 425 files, 0 violations
  (the diff adds no colour/radius/styling).
- **Component architecture / coding standards:** the change centralises date formatting behind two pure
  functions (`formatDate`, `formatDateTime`), replacing scattered inline `toLocaleDateString(..., { month: 'short' })`.
  No `any`, no floating promises, no magic values; imports ordered; one component per file preserved.
- **Naming / typing:** `DateInput` union typed; functions return `''` on invalid input (matches prior
  per-site guards). TZ-safe local-midnight construction in `groupByDate`/`dashboards` preserved.
- **Tests:** util has a locale-agnostic test; affected component/unit tests updated to compute expected via
  the util (no hard-coded locale strings). Full suite green (263 suites / 1528 tests).

**Result: CLEAN — no code-review findings.**
