# surface-fields-attachment-toolkit-605f794 — security-review findings

**Scope:** database + api (Attachment + Toolkit item field surfacing + export).
**Checklists:** database-backend-security.md, api-middletier-security.md (OWASP A01–A10).

## Iteration 1 — 0 findings

- **A01 Broken Access Control** — `ExportService.ExportObjectAsync` gates
  `HasWorkspaceLevelAsync(userId, workspaceId, Viewer)` before calling either descriptor's
  `BuildExportAsync`; both `usp_GetAttachmentsForWorkspace` and `usp_GetToolkitForWorkspace` filter
  `WHERE WorkspaceId = @Ws`, so a caller can only export rows of a workspace they are already a Viewer
  of. This is the same model as the shipped Request/Task/Feature export (workspace Viewer sees all
  workspace rows for list/export; attachments are gated by workspace membership in the existing
  per-record path too) — no cross-workspace leak, no IDOR, no widening (BS §22.4).
- **A03 Injection** — every value passed via `SqlParameter`. `TRY_CAST(a.CreatedBy AS UNIQUEIDENTIFIER)`
  casts a stored audit value inside the query; no string concatenation/interpolation into SQL.
- **A09 Logging/Monitoring** — no log statements added. Attachment file names are Confidential-adjacent;
  Toolkit Description/Body may carry sensitive content; uploader/updater display names are PII. None are
  logged — they travel only in the authorized export CSV response, consistent with existing exports.
- **Data exposure** — blob paths are never surfaced (proc omits `BlobPath` / `AttachmentBlobPath`; only
  the file name + a computed `HasAttachment` bit are returned).
- No secrets, no new config, no new external calls.

**End-of-iteration open set:** empty.

## Final Status: CLEAN
