# attachments

Slice 11 — the S4/S5 Attachments tab: upload (drag-and-drop / choose files), external-link attach,
download, and remove.

- `AttachmentsCard` — the tab content: drop zone + per-file upload progress, the stored list
  (download / remove), and the link form. Renders explicit loading / error / empty states.
- `useAttachments` — TanStack Query hooks (list / link / remove), `saveAttachment` (opens a link or
  fetches + saves a native file), and `useAttachmentUploader` (a concurrency-limited uploader that
  tracks per-file uploading / failed state, cap `MAX_CONCURRENT_UPLOADS`).
- `api` — one wrapper per endpoint; uploads post multipart form data, downloads go through
  `apiFetchBlob` so the bearer token rides along.

Wired into the record detail's Attachments tab (`features/requests/.../RecordDetailPage`).
