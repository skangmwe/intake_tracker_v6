# slice-toolkit-object-bd56143 — security-review findings

Scope: the Toolkit slice diff. Checklists: database-backend-security, api-middletier-security,
web-frontend-security. OWASP A01–A10 walked for the changed layers.

## Iteration 1 — no open findings

- **A01 Broken access control:** one authoritative check on every path. Reads (`usp_QueryToolkit`,
  `usp_GetToolkitItemForUser`) bake membership into the query; writes require Member+ via `IAccessGuard`;
  retire/restore self-gate on Member+ inside the proc. Forbidden **and** non-existent both return **403,
  never 404** (BS §22.6) — existence never disclosed. Workspace-scoped; items never leak cross-workspace.
- **A03 Injection:** every dynamic value is a `SqlParameter`. `ExecuteSqlRawAsync`/`FromSqlRaw` calls use
  constant SQL strings + parameters; `RetireAsync`/`RestoreAsync` use constant EXEC strings (the earlier
  interpolated-proc-name form was fixed in code review — EF1002). No string concatenation/interpolation.
- **A04 Insecure design / file upload:** extension allowlist (`.md/.markdown/.txt/.docx/.pdf`) + max size
  (`ToolkitOptions`, `IOptions<T>` — config, not hardcoded) enforced **before** streaming. Filename
  sanitized via `Path.GetFileName` (rejects traversal/absolute). Streamed to Blob via `IBlobStreamer` (no
  full-file buffering). api-blob-attachments error chain honoured: blob-fail → no row → 502;
  SQL-fail-after-blob → orphan blob deleted → 500.
- **A05 Misconfiguration / caching:** attachment download inherits `Cache-Control: private, no-store` from
  `CacheControlMiddleware`. `[Authorize]` inherited (no anonymous route added). No secrets, no connection
  strings, no `appsettings` changes.
- **A08 Data integrity:** PATCH uses ROWVERSION ETag optimistic concurrency (409 stale).
- **A09 Logging / PII:** the service logs nothing; free-text (name/one-liner/description/body/maintainer)
  and file names are never logged. Event-spine payloads carry ids/enums only (`"{}"`), per
  api-pii-handling.md.
- **Web (A03/A07):** no `dangerouslySetInnerHTML`, no `eval`/`new Function`. All item text is rendered as
  escaped React children. Uploads via `FormData`; downloads via bearer-authenticated `apiFetchBlob` +
  `saveBlob`. Clipboard uses `navigator.clipboard.writeText` (no injection surface). No tokens/PII in
  storage.

No `Mechanical`, `Architectural`, or `Pending-decision` security findings. Max severity: none.
