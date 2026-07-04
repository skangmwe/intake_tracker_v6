# Code-review findings — slice-similar-requests-activity-cd32a6a

Scope: the slice-6 diff (DB migration 032 + 3 procs + tSQLt; API Comments module + similar endpoint; web comments feature + S3 panel + shared parseMentions/constants/problemMessage). Checklists: `database-backend.md`, `api-middletier.md`, `web-frontend.md`.

## Iteration 1

**Design conformance (deterministic gate):** `check-design-conformance.sh --web-required` → **PASS** — 0 raw colours / off-spec radii across 128 scanned files; every value traces to a token.

### High / Critical
- None.

### Mechanical (auto-applied — see remediations log)
- `renderBody` per-word span fragmentation (ActivityTab.tsx) — fixed in Phase 0.

### Low (accepted — no change)
1. **`SimilarRequestDto.stage` surfaces the stage key, not the label** (`usp_FindSimilarRequests` / `RequestsService.FindSimilarAsync`). The nudge shows e.g. `build` rather than `Build`. Resolving the label per match would mean a stages read per typeahead result — not worth it for a 3-item nudge. The DTO doc already says "label (or key when no label resolves)". Serviceable; leave as-is.
2. **Event thread `key` uses list index** (`ActivityTab.tsx` EventItem). The thread is append-only, refetched wholesale, and ordered chronologically, so index+eventAt keys are stable in practice. Acceptable.

## Notes verified against the checklists
- Every async method threads `CancellationToken`; library code uses `ConfigureAwait(false)`.
- No business logic in controllers; ownership/non-existence → **403 never 404** on both new record-scoped endpoints (BS §22.6).
- No PII logged; the `comment.posted` event payload carries ids only (commentId + mentionedUserIds), never body/names.
- `Comments` immutability enforced by trigger (no PATCH/DELETE endpoint); corrections are new comments.
- Web: all three remote-data states (loading/error/empty) rendered in `ActivityTab`; debounce/min-length as named shared constants; URL built via the shared `withQuery`; `problemMessage` extracted to `/shared` on second consumer; `useEffect` debounce cleans up its timer.
