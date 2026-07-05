# slice-announcements-cdea4f0 — code-review findings

**Scope:** the uncommitted slice-13 diff (DB migrations 042/043 + 9 procs, API Announcements module + Notifications changes, shared types, web announcements feature + BellMenu/nav wiring).

## Iteration 1

### Design conformance (deterministic gate)
- `check-design-conformance.sh --web-required` → **PASS**, 0 violations / 183 files scanned. Every colour and radius in the new component styles (`announcements.css`) traces to a `var(--…)` token.

### Database
- Announcements table: PK + 6 audit cols + soft-delete, FK indexes on both FKs, CHECK on Status + `ISJSON(Audience)`, pinned-first covering index — conforms to `database-coding-standards.md` / `database-performance.md`. ✓
- Migrations idempotent (`IF NOT EXISTS` / `COL_LENGTH`) with rollbacks; the FK add is ordered after the table exists. ✓
- Write procs: `SET NOCOUNT ON`/`SET XACT_ABORT ON`, `TRY/CATCH` + explicit transaction + `@@TRANCOUNT` guard + `THROW`; read procs correctly carry no transaction. ✓
- All dynamic values parameterized; no dynamic SQL. Access gates baked into the read procs; no result-set-from-a-gate (each proc returns only its intended set). ✓
- **Verified live** against real SQL Server: full deploy clean (0 errors), plus create / access-gate / publish-idempotency / fan-out behaviour.

### API
- Controller routes/validates/authorizes only; no business logic. 403-not-404 on every access path; ProblemDetails everywhere; no stack traces. `CancellationToken` threaded through every async method. ✓
- All EXEC calls use `SqlParameter`. DTO naming `*Request`/`*Dto`, service `IAnnouncementsService`. Pagination via `AnnouncementQuery` (`[Range(1,100)]`) + proc clamp. ✓
- Cache-Control: user-scoped reads inherit the middleware default (`private, no-store`) — no cross-user edge caching. ✓

### Web
- Every page renders explicit loading / error / empty states. Components ≤200 lines, one-per-file, data fetching in hooks. `data-ds` on design-system elements (StatusPill, shared Button/Form fields, card rows). Named constant `ANNOUNCEMENTS_PAGE_SIZE`. No new dependencies. ✓
- Body rendered as plain text (`white-space: pre-wrap`) — **no `dangerouslySetInnerHTML`** (web-coding-standards). ✓

### Findings
- **No High/Critical.**
- **Low (accepted):** BellMenu deep-link tests emit a benign React `act(...)` warning on the post-click navigation state update; tests pass and assert via `waitFor`. Accepted — cosmetic test-console noise, no behavioural impact.
- **Low (accepted, documented decision):** rich-text body is rendered as plain text until a sanitizer is wired; recorded in the slice doc.

**Mechanical fixes auto-applied this iteration:** none required (diff authored clean).
