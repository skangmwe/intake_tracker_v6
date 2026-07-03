# Blob Attachments — Frontend Rules (Tier 1)

> **See also:** `api-blob-attachments.md` — backend storage rules, batch lifecycle,
> ownership enforcement (`403`), and error chain. Read both before implementing either side.

The frontend for basic file attachments: pick one or more files, upload them, show progress,
list what's attached, download, and remove. This is multi-file upload UX **only** — there is
no document processing, no indexing status to poll for, no "open in viewer with citations."

## Upload sequence

1. Create a batch (`POST /{parent}/{parentId}/attachment-batches`) when the user starts an
   attach action — whether they picked **one file or many**; a single file is a batch of one.
   Hold the returned `batchId`.
2. Upload each selected file with its own `POST /attachments` call. Run at most **5 uploads
   concurrently** — queue the rest and start the next as each finishes.
3. After the last file resolves, send the one-time complete signal
   (`POST /attachment-batches/{batchId}/complete`).

## Progress and status

- Show **per-file** progress (uploading / stored / failed) — not just a single aggregate bar.
- A file is done the moment its upload call returns `201` (status `Stored`). There is **no
  processing phase to poll** — do not build an "indexing… / ready" poller; that belongs to the
  Tier 1+ pipeline, not to attachments.
- A single failed file does not fail the set — let the others finish and offer a per-file
  retry. A retry re-uploads into the **same batch** — reuse the existing `batchId`, never
  create a new batch for a retry. Send the `/complete` signal only after every file has
  resolved (retries included), so the batch count and status stay correct.

## Trust and access

- Never derive attachment state from local guesses — the attachment list comes from the API
  (`GET /{parent}/{parentId}/attachments`), which already enforces ownership and soft-delete.
- Do not display a download link the API would reject — the API is the authority on
  visibility; a `403` is the API's call, not something the UI pre-empts by inventing rules.

## Accessibility and styling

- The file picker, progress list, and remove controls follow the design rule files
  (`web-component-architecture.md`, `web-styling.md`, accessibility rules). Upload controls
  need accessible names; progress updates announce via an `aria-live` region.

## Out of scope (Tier 1+ only)

Document viewer, citation highlighting, extraction/indexing status, "ask a question about
this file." If the product needs any of these, the app has outgrown Tier 1 — escalate.
