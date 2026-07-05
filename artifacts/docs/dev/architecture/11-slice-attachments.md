---
slice: 11-attachments
capability: Upload, list, download, and remove attachments on a record; attachments follow the record on escalation.
spec-section: api-blob-attachments.md + BS §2.3 (files are the Attachments object); api-contracts.md §8
started: 2026-07-05T08:38:16-04:00
ended: 2026-07-05T09:14:48-04:00
duration: 00:36:32
---

# Slice 11 — Attachments

Files (and external links) that follow a record. Endpoints follow **api-contracts §8** (the per-record model), not the batch-grouping variant in `api-blob-attachments.md` — the contract is authoritative and deliberately simplified for this app.

## Decisions (non-obvious / contract-affecting)

1. **Blob storage is config-selected, with a filesystem fallback.** `IBlobStreamer` has two implementations chosen in `Program.cs`: `AzureBlobStreamer` (Azure.Storage.Blobs + `DefaultAzureCredential`) when `Storage:BlobAccountUri` is set, and `LocalBlobStreamer` (filesystem, path-traversal-guarded) when it is empty. Rationale: the dev/test stack is LocalDB with **no Azure Blob**, and integration tests run against real resources (no mocks). This mirrors the established precedent — the Service-Bus publisher runs no-op when its namespace is empty (slice 1), and the escalation mirror is read-time-derived because there is no Service Bus (slice 9). Adds the `Azure.Storage.Blobs` dependency (the SDK `api-blob-attachments.md` mandates; version 12.29.1, verified against the live registry). **Approved at plan confirmation.**

2. **Escalation carry-across = duplicated pointer rows, no blob copy.** `usp_EscalateRequest` now duplicates each live PG-side attachment as a new AI-side row (new `AttachmentId`, AI `WorkspaceId`) **sharing the original `BlobPath`** — both sides point at the same stored bytes. SQL is the source of truth for the pointer (`api-blob-attachments.md`), so download resolves the path from the row regardless of side; no physical blob copy is needed. Native uploads and external links both carry across. Slice 9 deferred this here because the `Attachments` table didn't exist yet. Runs inside the existing escalation transaction; safe via deferred name resolution + migrations-precede-procedures ordering.

3. **"Side panel" → the existing Attachments tab.** The slice plan says "Attachments card on the S4/S5 side panel", but the as-built record detail (slice-5 reconciliation) is a **6-tab layout with no right rail**. The card wires into the record detail's existing **Attachments tab** (which was a stub), consistent with how Relationships (Status tab), Tasks, and Activity landed. The plan's "side panel" language is superseded by the built layout; the prototype wins.

4. **413 for oversize, 400 for disallowed content-type.** `api-contracts.md §8` specifies **413** for a file over the 25 MB limit; the generic `api-blob-attachments.md` test list says 400 for both oversize and disallowed type. The project-specific contract (api-contracts §8) is more specific and wins: **413** for size, **400** (ValidationProblem) for a disallowed content type. Both are enforced at the controller boundary before any bytes stream. Max size + allowlist come from `AttachmentsOptions` (bound via `IOptions<T>` from the `Attachments` config section).

5. **Shared `apiClient` extended.** `apiFetch` now passes a `FormData` body through untouched (no `Content-Type`, no JSON-stringify — the browser sets the multipart boundary) for the streaming upload; a new `apiFetchBlob` fetches an authenticated binary response so downloads carry the bearer token (a plain `<a href>` cannot).

## Access model

Every read/write path is access-gated in SQL by a `WorkspaceMembership` join on the attachment's (or record's) own `WorkspaceId` — a forbidden or non-existent record/attachment returns **zero rows / `@Inserted=0` / `@Deleted=0`**, which the API maps to **403, never 404** (BS §22.6). The API additionally requires **Member+** (via `AccessGuard`) to upload / link / delete. The list read resolves the record first (null → 403) so an accessible-but-empty record returns `[]`, not 403. `BlobPath` is never returned by the list read — the pointer never leaves the server.

## Events

Adds `attachment.added` / `attachment.removed` to the event spine (ids only — file names are Confidential-adjacent and never logged). Consistent with "every state-changing slice emits"; the slice-6 activity thread prettifies these to "Attachment added" / "Attachment removed".

## Not done here (by design)

No batch-grouping endpoints (api-contracts §8 is per-record), no document processing / extraction / indexing (that is the Tier-1+ document pipeline, out of scope), no physical blob retention job (soft-delete leaves the blob for a retention policy).
