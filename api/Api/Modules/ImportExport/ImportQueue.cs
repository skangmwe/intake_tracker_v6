// In-process import queue (Slice 16). The dev/test stack has no Service Bus (the documented
// Worker/Service-Bus processing path is a no-op when the namespace is unset — the same precedent as
// slice 9's derived mirror, slice 11's config-selected blob, slice 12's in-process fan-out). So the
// CSV upload endpoint hands the job off to this unbounded single-reader channel and returns 202
// immediately (api-performance.md — no long-running work inline); ImportProcessor (a hosted service)
// drains it off the request thread. The message carries everything the runner needs, so no read-back
// proc is required.

using System.Threading.Channels;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

/// <summary>The hand-off descriptor for one queued import. FileName/BlobPath are non-secret pointers;
/// no CSV content or PII rides the queue.</summary>
public sealed record ImportJobMessage(
    Guid ImportId,
    Guid WorkspaceId,
    Guid StartedByUserId,
    string BlobPath,
    string FileName,
    string OperationId);

public interface IImportQueue
{
    /// <summary>Queue a job for the background processor. Never blocks (unbounded channel).</summary>
    ValueTask EnqueueAsync(ImportJobMessage message, CancellationToken cancellationToken);

    /// <summary>Drain queued jobs until cancellation (single reader — the hosted processor).</summary>
    IAsyncEnumerable<ImportJobMessage> DequeueAllAsync(CancellationToken cancellationToken);
}

public sealed class ImportQueue : IImportQueue
{
    private readonly Channel<ImportJobMessage> _channel =
        Channel.CreateUnbounded<ImportJobMessage>(new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = false,
        });

    public ValueTask EnqueueAsync(ImportJobMessage message, CancellationToken cancellationToken) =>
        _channel.Writer.WriteAsync(message, cancellationToken);

    public IAsyncEnumerable<ImportJobMessage> DequeueAllAsync(CancellationToken cancellationToken) =>
        _channel.Reader.ReadAllAsync(cancellationToken);
}
