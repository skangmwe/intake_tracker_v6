// Streaming Blob upload/download/delete via Managed Identity (api-blob-attachments.md — stream
// directly, never buffer the full file in API memory). Two implementations are registered by
// config: AzureBlobStreamer when Storage:BlobAccountUri is set, LocalBlobStreamer (filesystem)
// otherwise, so the LocalDB / no-Azure dev stack runs the full attachment cycle. The blob path is a
// server-allocated opaque key (SQL is the source of truth for the pointer) — access is never
// derived from it (that is enforced in the access-gated stored procs).

using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace McDermott.AiTracker.Api.Shared.Storage;

public interface IBlobStreamer
{
    /// <summary>Streams <paramref name="content"/> to <paramref name="blobPath"/> (overwrites).</summary>
    Task UploadAsync(string blobPath, Stream content, string contentType, CancellationToken cancellationToken);

    /// <summary>Opens a read stream for the blob. Throws if the blob is missing.</summary>
    Task<Stream> DownloadAsync(string blobPath, CancellationToken cancellationToken);

    /// <summary>Best-effort delete (used to clean up an orphaned blob after a SQL failure).</summary>
    Task DeleteAsync(string blobPath, CancellationToken cancellationToken);
}

/// <summary>
/// Azure Blob implementation. Authenticates with Managed Identity via DefaultAzureCredential — no
/// account key, no connection string (api-secrets.md). The container is created lazily on first use.
/// </summary>
public sealed class AzureBlobStreamer : IBlobStreamer
{
    private readonly BlobContainerClient _container;

    public AzureBlobStreamer(BlobServiceClient serviceClient, string containerName)
    {
        _container = serviceClient.GetBlobContainerClient(containerName);
    }

    /// <summary>Factory used by DI — builds the SDK client from the account URI + Managed Identity.</summary>
    public static AzureBlobStreamer Create(string blobAccountUri, string containerName) =>
        new(new BlobServiceClient(new Uri(blobAccountUri), new DefaultAzureCredential()), containerName);

    public async Task UploadAsync(string blobPath, Stream content, string contentType, CancellationToken cancellationToken)
    {
        await _container.CreateIfNotExistsAsync(cancellationToken: cancellationToken).ConfigureAwait(false);
        var blob = _container.GetBlobClient(blobPath);
        var options = new BlobUploadOptions { HttpHeaders = new BlobHttpHeaders { ContentType = contentType } };
        await blob.UploadAsync(content, options, cancellationToken).ConfigureAwait(false);
    }

    public async Task<Stream> DownloadAsync(string blobPath, CancellationToken cancellationToken)
    {
        var blob = _container.GetBlobClient(blobPath);
        var response = await blob.DownloadStreamingAsync(cancellationToken: cancellationToken).ConfigureAwait(false);
        return response.Value.Content;
    }

    public async Task DeleteAsync(string blobPath, CancellationToken cancellationToken)
    {
        var blob = _container.GetBlobClient(blobPath);
        await blob.DeleteIfExistsAsync(cancellationToken: cancellationToken).ConfigureAwait(false);
    }
}
