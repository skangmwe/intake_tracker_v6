// Unit tests for LocalBlobStreamer — the filesystem fallback used when Storage:BlobAccountUri is
// empty (dev / test). Covers the upload → download roundtrip (bytes preserved), delete (idempotent),
// and the path-traversal guard that keeps every resolved file inside the storage root. Each test
// uses an isolated temp root and cleans up (api-testing-guidelines.md).

using McDermott.AiTracker.Api.Shared.Storage;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class LocalBlobStreamerTests : IDisposable
{
    private readonly string _root;
    private readonly LocalBlobStreamer _sut;

    public LocalBlobStreamerTests()
    {
        _root = Path.Combine(Path.GetTempPath(), "ai-tracker-tests-" + Guid.NewGuid().ToString("N"));
        _sut = new LocalBlobStreamer(_root);
    }

    [Fact]
    public async Task UploadThenDownload_RoundtripsBytes()
    {
        // Arrange
        var payload = new byte[] { 10, 20, 30, 40 };
        const string blobPath = "ws/AIS-1/att-1/brief.pdf";

        // Act
        await _sut.UploadAsync(blobPath, new MemoryStream(payload), "application/pdf", CancellationToken.None);
        await using var download = await _sut.DownloadAsync(blobPath, CancellationToken.None);
        using var buffer = new MemoryStream();
        await download.CopyToAsync(buffer);

        // Assert
        Assert.Equal(payload, buffer.ToArray());
    }

    [Fact]
    public async Task Delete_RemovesTheBlob_AndIsIdempotent()
    {
        // Arrange
        const string blobPath = "ws/AIS-1/att-2/note.txt";
        await _sut.UploadAsync(blobPath, new MemoryStream(new byte[] { 1 }), "text/plain", CancellationToken.None);

        // Act
        await _sut.DeleteAsync(blobPath, CancellationToken.None);
        await _sut.DeleteAsync(blobPath, CancellationToken.None); // second delete is a no-op, not a throw

        // Assert — the file is gone; a follow-up download throws (missing blob).
        await Assert.ThrowsAsync<FileNotFoundException>(() => _sut.DownloadAsync(blobPath, CancellationToken.None));
    }

    [Fact]
    public async Task Upload_PathTraversal_IsRejected()
    {
        // Act + Assert — a path that escapes the root is refused before any bytes are written.
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            _sut.UploadAsync("../escape.txt", new MemoryStream(new byte[] { 1 }), "text/plain", CancellationToken.None));
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }
}
