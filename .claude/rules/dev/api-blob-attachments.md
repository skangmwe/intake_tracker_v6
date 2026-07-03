# Blob Attachments — API Rules (Tier 1)

Basic file attachments for a Tier 1 app: upload, list, download, delete files against a
record, gated by the same role/ownership model as everything else. This is the **front
half** of the firm Tier 1+ document-upload pipeline — multi-file streaming upload, batch
grouping, Blob Storage, SQL metadata — with **no back half**.

## The line: attachment vs. document pipeline

A Tier 1 attachment is **stored, never processed**. The app puts the bytes in Blob Storage
and records metadata in SQL; it never reads *into* the file.

The moment the app needs to **process** a file's content — text extraction / OCR, chunking,
embeddings, vector search, RAG, answering questions over it — **or** needs any **background
worker, Service Bus, or queue** for any reason, this is no longer an attachment. **Stop and
escalate** to the firm Tier 1+ framework (see `_core-requirements.md` → Project Scope). That
is the bright line; do not cross it inside Tier 1.

## Storage

- Stream the file **directly to Blob Storage** — never buffer the full file in API memory.
  Pipe `Request.Body` / `IFormFile.OpenReadStream()` to `BlobClient.UploadAsync()`.
- Authenticate to Blob Storage with **Managed Identity** via `DefaultAzureCredential` — no
  account keys, no connection strings carrying secrets (`api-secrets.md`).
- **SQL is the source of truth for the blob pointer.** The `Attachment` row stores the exact
  `BlobPath`; nothing ever navigates the container to locate a file. Keep storage flat:
  - **One container per app**, name from config (non-secret — `api-coding-standards.md`).
  - **The blob name is an opaque, server-allocated `{AttachmentId}` GUID**, generated before
    the upload and written to SQL. A GUID is globally unique, so uploads can never collide —
    no filename de-dup is required. Appending `/{fileName}` is optional and cosmetic (storage
    tooling visibility only); it is never load-bearing.
  - **Never derive access or identity from the path.** Ownership/role is always checked against
    SQL; the path is a key, not an ACL. Original `FileName` and `ContentType` come from the row
    and are returned via `Content-Disposition` / response headers.
- **The exact path shape is an application decision — record it in the app's `decisions.md`.**
  The framework requires only the invariants above: a flat container, a globally-unique opaque
  key, a SQL-authoritative pointer, and access enforced from SQL (not the path). An app with a
  specific operational need (e.g. prefix-delete-per-parent) may prepend a single segment such
  as `{parentId}/`, but it is not required — SQL already enumerates a parent's attachments for
  bulk delete.
- Native Blob **versioning** (a container setting) is the only sanctioned versioning
  mechanism — do not build a custom version pipeline.

## Batch grouping

Uploads are grouped into a batch so a set of files attached together is tracked as a unit.
A batch holds **one or more** files — a single-file attachment is simply a batch of one and
goes through the same create → upload → complete sequence as a multi-file batch. This reuses
the document-upload batch concept; the *processing* semantics are dropped.

- `POST /{parent}/{parentId}/attachment-batches` → create an `AttachmentBatch`, return
  `batchId`. **Verify ownership of the parent first → `403` if not an owner.**
- `POST /attachments` → **one call per file**, with `batchId` + `parentId` in the body.
  Stream to Blob, create one SQL `Attachment` row (status `Stored`), return `201` with
  `attachmentId`. The client may run up to **5 uploads concurrently** (`web-blob-attachments.md`).
- `POST /attachment-batches/{batchId}/complete` → one-time signal meaning "all files
  submitted." Count the `Attachment` rows **actually linked to the batch in SQL** — never
  trust a client-supplied count. Idempotent: if already complete, return `200` without
  reprocessing.
- A batch has **no processing outcome to roll up**. It is complete as soon as the last upload
  returns and the complete signal is received. There is no `Indexing` / `Processing` state and
  no worker waiting to advance it.

## Status

Per-attachment status is `Pending` → `Stored` (terminal on success) or `Failed`. There are
**no asynchronous transitions** — the status is final when the upload call returns.

- `GET /{parent}/{parentId}/attachments` → list attachments (paginated). **Verify the caller can access the parent first → `403` if
  not** — never return a parent's attachments to someone who cannot see the parent. Each row carries
  `attachmentId`, `fileName`, `contentType`, `sizeBytes`, `status`, and audit fields.
  Soft-deleted rows are excluded.
- `GET /attachments/{attachmentId}/content` → stream the blob back. `Cache-Control: private,
  no-store`. Verify ownership; ownership violation → `403`, never `404`.

## Validation (controller boundary)

- Enforce a **content-type allowlist** and a **max file size** before streaming. Both values
  come from config bound via `IOptions<T>` — never hardcoded, never invented.
- Sanitize the supplied file name (`Path.GetFileName()`; reject `..`, `/`, `\`, absolute
  paths) — see `api-validation.md`.
- Verify the caller owns the parent record before accepting the upload.

## Persistence

- One `Attachment` row per file: PK + six audit columns + soft-delete
  (`database-coding-standards.md`). Columns: `BlobPath`, `FileName`, `ContentType`,
  `SizeBytes`, `BatchId`, `ParentType`, `ParentId`, `Status`. Index every FK.
- One `AttachmentBatch` row: audit columns + `TotalAttachments` + `Status`
  (`Pending` → `InProgress` on the complete signal).
- Delete is **soft** by default (`IsDeleted` + `DeletedAt`). The blob is removed, or retained
  per the project's documented retention policy — state the choice in `decisions.md`.

## Error chain (same shape as the pipeline, minus Service Bus)

- Blob upload fails → do **not** create the SQL row → return `502` ProblemDetails.
- SQL insert fails after a successful blob upload → delete the orphaned blob → return `500`.
- A failed single attachment does not fail the batch — other files continue; the batch
  completes with the rows that succeeded.

## Explicitly out of scope — escalate to Tier 1+ if required

No Service Bus publish, no Worker, no `DocumentIndexMessage`, no Azure Document Intelligence,
no text extraction / OCR, no chunking, no embeddings, no vector index, no RAG, no conversation
history grounded on the file. Any one of these means the app has outgrown Tier 1 — stop and
escalate.

## Tests

- xUnit: happy-path upload (blob written **and** row created), oversize / disallowed
  content-type rejection (`400`), ownership violation (`403`), blob-fail (`502`, no row),
  SQL-fail-after-blob (`500`, blob deleted), soft-delete exclusion on list, cancellation.
- At least one integration test covering the full upload → list → download → delete cycle.
