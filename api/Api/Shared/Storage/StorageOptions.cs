// Non-secret Blob Storage configuration (api-secrets.md — the account URI + container name are
// non-secret; auth is Managed Identity, so there is no connection string to store). Bound from the
// "Storage" configuration section. When BlobAccountUri is empty (local / dev / test), the app falls
// back to LocalBlobStreamer (filesystem), mirroring the Service-Bus no-op-when-namespace-empty
// pattern so the LocalDB / no-Azure dev stack runs the full upload → download → delete cycle.

namespace McDermott.AiTracker.Api.Shared.Storage;

public sealed class StorageOptions
{
    public const string SectionName = "Storage";

    /// <summary>
    /// Blob endpoint, e.g. "https://aitracker.blob.core.windows.net". When empty, the app uses
    /// the local filesystem streamer instead of Azure Blob.
    /// </summary>
    public string BlobAccountUri { get; set; } = string.Empty;

    /// <summary>The single flat container that holds every app attachment (api-blob-attachments.md).</summary>
    public string ContainerName { get; set; } = "attachments";

    /// <summary>
    /// Filesystem root for LocalBlobStreamer (dev / test). When empty, a per-machine temp directory
    /// is used. Ignored once BlobAccountUri is set.
    /// </summary>
    public string LocalRootPath { get; set; } = string.Empty;
}
