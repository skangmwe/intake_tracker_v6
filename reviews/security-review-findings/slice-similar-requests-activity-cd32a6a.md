# Security-review findings — slice-similar-requests-activity-cd32a6a

Scope: slice-6 diff. Checklists: `database-backend-security.md`, `api-middletier-security.md`, `web-frontend-security.md` (OWASP A01–A10 + data-protection).

## Iteration 1

### Critical / High
- None.

### Reviewed — clean
- **A01 Broken access control.** Every new read/write is access-gated **server-side**: `usp_FindSimilarRequests`, `usp_CreateComment`, `usp_GetActivityThread` all join `WorkspaceMembership`; the `similar` controller re-checks Viewer; comment post/thread resolve the caller's side via `usp_GetRequestByIdForUser`. A forbidden or non-existent record returns **403, never 404** — existence is never disclosed. Similar/thread are workspace-scoped — no cross-workspace leak (BS §9.5).
- **A03 Injection.** All SQL is parameterized (`SqlParameter` / `FromSqlRaw` with parameters / table-variable). `usp_FindSimilarRequests` escapes LIKE metacharacters (`[`, `%`, `_`) in user tokens so query text can't act as a wildcard pattern. No string-built SQL.
- **XSS (web).** Comment bodies render through React text nodes (`renderBody` — escaped); no `dangerouslySetInnerHTML`, no `eval`. Stored comment content cannot execute.
- **A09 Logging / PII.** No comment body, name, or email logged. The `comment.posted` event payload is ids only (Entra oids = pseudonymous, the only permitted user identifier) — `api-logging.md` / `api-pii-handling.md` respected.
- **A02/A05.** No new secrets, no new config surface, no new external integration. MI/auth unchanged.

### Pending-decision
- None.
