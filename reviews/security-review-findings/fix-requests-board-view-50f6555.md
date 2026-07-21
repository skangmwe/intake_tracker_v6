# Security-review findings — fix-requests-board-view-50f6555

## Iteration 1

Scope: `web/src/features/requests/components/RequestsListPage.tsx` + `.test.tsx` (diff-only).

**No findings (Critical / High / Medium / Low).**

Rationale — presentation-only change:
- The board renders the same access-filtered `rows` the table renders; `ViewModeToggle` is a
  layout affordance and never widens visibility (A01 — broken access control: N/A, no new data
  path).
- Card `onOpen` navigates to `/requests/:id`, identical to the existing table row click.
- No SQL, no queries, no new API calls (A03 — injection: N/A).
- Text is rendered through React; no `dangerouslySetInnerHTML`, `eval`, or dynamic HTML (A03 — XSS: N/A).
- No secrets, tokens, storage, or auth logic touched (A02 / A07: N/A).
- No new dependencies (A06 — vulnerable components: N/A).
