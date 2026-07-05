# Storage

## What belongs here

Streaming Blob upload/download/delete behind `IBlobStreamer` (slice 11). Two implementations,
selected in `Program.cs` by `Storage:BlobAccountUri`:

- `AzureBlobStreamer` (`BlobStreamer.cs`) — Azure.Storage.Blobs via Managed Identity
  (`DefaultAzureCredential`). Used when the account URI is configured.
- `LocalBlobStreamer` — filesystem, path-traversal-guarded. Used when the URI is empty (local / dev /
  test), so the no-Azure stack runs the full attachment cycle. Mirrors the Service-Bus
  no-op-when-config-empty pattern.

`StorageOptions` binds the (non-secret) account URI, container name, and local root.

## What does not belong here

Attachment metadata persistence — that's the Attachments module's SQL work. Access control — enforced
in the access-gated stored procs, never derived from the blob path. Retention policies — deployment
configuration.

_Traced from `/artifacts/docs/dev/architecture/shared-inventory.md` (`blob-client`)._
