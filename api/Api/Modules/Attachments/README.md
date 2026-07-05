# Attachments

Files (and external links) that follow a record (BS §2.3, module-boundaries.md § 10). Endpoints per
api-contracts.md §8 (per-record model): upload (streaming), external link, download, list, delete.

- `AttachmentsController` — routes / boundary validation (allowlist, 25 MB → 413, filename sanitize)
  / status mapping. A forbidden or non-existent record is **403, never 404** (BS §22.6).
- `AttachmentsService` — access-gates via `usp_GetRequestByIdForUser` + `AccessGuard` (Member+ to
  mutate), streams to Blob (`IBlobStreamer`) then persists the pointer row. Error chain per
  `api-blob-attachments.md`: blob fail → no SQL row (502); SQL fail after blob → delete blob (500).
- `AttachmentDtos` / `AttachmentsOptions` — wire contracts + validation limits (`IOptions<T>`).

Blob bytes go through `IBlobStreamer` (`api/Shared/Storage/`) — Azure or filesystem by config. SQL is
the source of truth for the blob pointer; access is never derived from the path. Escalation
carry-across is handled in `usp_EscalateRequest` (duplicated AI-side rows sharing the `BlobPath`).
