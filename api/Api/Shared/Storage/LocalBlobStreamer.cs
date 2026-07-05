// Filesystem fallback for IBlobStreamer, used when Storage:BlobAccountUri is empty (local / dev /
// test — the stack has no Azure Blob, mirroring the Service-Bus no-op-when-namespace-empty pattern).
// Bytes stream to and from files under a root directory; the same access-gated stored procs guard
// who may reach a blob path, so this store carries no auth of its own. A path-traversal guard keeps
// every resolved file inside the root even though blob paths are already server-allocated.

namespace McDermott.AiTracker.Api.Shared.Storage;

public sealed class LocalBlobStreamer : IBlobStreamer
{
    private readonly string _root;

    public LocalBlobStreamer(string? localRootPath)
    {
        _root = string.IsNullOrWhiteSpace(localRootPath)
            ? Path.Combine(Path.GetTempPath(), "ai-tracker-blobs")
            : localRootPath;
        Directory.CreateDirectory(_root);
    }

    public async Task UploadAsync(string blobPath, Stream content, string contentType, CancellationToken cancellationToken)
    {
        // contentType is not persisted separately in the local store — the SQL row is authoritative
        // for ContentType (api-blob-attachments.md). It is accepted here to match the interface.
        _ = contentType;
        var target = ResolvePath(blobPath);
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        await using var file = new FileStream(target, FileMode.Create, FileAccess.Write, FileShare.None);
        await content.CopyToAsync(file, cancellationToken).ConfigureAwait(false);
    }

    public Task<Stream> DownloadAsync(string blobPath, CancellationToken cancellationToken)
    {
        var target = ResolvePath(blobPath);
        Stream stream = new FileStream(target, FileMode.Open, FileAccess.Read, FileShare.Read);
        return Task.FromResult(stream);
    }

    public Task DeleteAsync(string blobPath, CancellationToken cancellationToken)
    {
        var target = ResolvePath(blobPath);
        if (File.Exists(target))
        {
            File.Delete(target);
        }

        return Task.CompletedTask;
    }

    /// <summary>
    /// Maps a forward-slash blob path to a file under the root, rejecting any path that escapes it.
    /// </summary>
    private string ResolvePath(string blobPath)
    {
        var relative = blobPath.Replace('/', Path.DirectorySeparatorChar).TrimStart(Path.DirectorySeparatorChar);
        var full = Path.GetFullPath(Path.Combine(_root, relative));
        var rootFull = Path.GetFullPath(_root) + Path.DirectorySeparatorChar;
        if (!full.StartsWith(rootFull, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Resolved blob path escapes the storage root.");
        }

        return full;
    }
}
