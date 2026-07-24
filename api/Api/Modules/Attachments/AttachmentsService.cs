// Attachments service (Slice 11 — api-contracts.md §8, api-blob-attachments.md). Owns the upload /
// link / list / download / delete lifecycle: it resolves the caller's side of the record (access
// baked into usp_GetRequestByIdForUser — null → 403, never disclose existence), requires Member+ to
// mutate, streams bytes to Blob (never buffering the full file), then persists the pointer row via
// the access-gated procs. The error chain follows api-blob-attachments.md exactly: a blob failure
// creates no SQL row (502); a SQL failure after a successful blob upload deletes the orphaned blob
// (500). File names can name a client artifact — Confidential-adjacent, never logged; event payloads
// carry ids only (api-pii-handling.md).

using System.Data;
using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Storage;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Attachments;

public enum AttachmentOutcome
{
    Success,
    /// <summary>Forbidden or non-existent record — the controller maps this to 403 (never 404).</summary>
    Denied,
    /// <summary>Blob upload failed after SDK retries — no SQL row was created (→ 502).</summary>
    BlobFailed,
    /// <summary>SQL insert failed after a successful blob upload — the blob was deleted (→ 500).</summary>
    PersistFailed,
}

public sealed record UploadResult(AttachmentOutcome Outcome, AttachmentDto? Attachment = null);

/// <summary>What the download endpoint needs to stream (or redirect for) a single attachment.</summary>
public sealed record AttachmentDownload(
    bool IsLink, string? ExternalUrl, string BlobPath, string FileName, string ContentType);

public interface IAttachmentsService
{
    /// <summary>List a record's attachments. Null → 403 (forbidden/non-existent record); [] when empty.</summary>
    Task<IReadOnlyList<AttachmentDto>?> ListAsync(string recordId, Guid userId, CancellationToken cancellationToken);

    /// <summary>Every attachment in a workspace, paginated — the read behind the Attachment CSV export.
    /// Access is the caller's Viewer membership on the workspace, gated upstream by ExportService before
    /// this is called (the workspace scope IS the row-level entitlement; export never widens access).</summary>
    Task<IReadOnlyList<WorkspaceAttachmentExportRow>> QueryWorkspaceAttachmentsAsync(
        Guid workspaceId, int page, int pageSize, CancellationToken cancellationToken);

    /// <summary>Stream + persist an uploaded file. See AttachmentOutcome for the status mapping.</summary>
    Task<UploadResult> UploadAsync(
        string recordId, string fileName, string contentType, long sizeBytes, Stream content,
        Guid actorUserId, string operationId, CancellationToken cancellationToken);

    /// <summary>Attach an external URL (no upload). Null → 403.</summary>
    Task<AttachmentDto?> LinkAsync(
        string recordId, string url, string title, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    /// <summary>Resolve one attachment for download. Null → 403 (forbidden/non-existent).</summary>
    Task<AttachmentDownload?> GetForDownloadAsync(Guid attachmentId, Guid userId, CancellationToken cancellationToken);

    /// <summary>Open the blob read stream for a resolved native (non-link) attachment.</summary>
    Task<Stream> GetContentStreamAsync(AttachmentDownload download, CancellationToken cancellationToken);

    /// <summary>Soft-delete an attachment. True → deleted; false → 403 (forbidden/non-existent).</summary>
    Task<bool> DeleteAsync(Guid attachmentId, Guid actorUserId, string operationId, CancellationToken cancellationToken);
}

public sealed class AttachmentsService : IAttachmentsService
{
    /// <summary>Sentinel BlobPath for an external-link row — never streamed (IsLink short-circuits).</summary>
    private const string ExternalLinkBlobPath = "external";
    private const string ExternalLinkContentType = "text/uri-list";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly IBlobStreamer _blob;
    private readonly IAccessGuard _accessGuard;
    private readonly IEventSpine _eventSpine;
    private readonly IClock _clock;

    public AttachmentsService(
        AppDbContext db, IBlobStreamer blob, IAccessGuard accessGuard, IEventSpine eventSpine, IClock clock)
    {
        _db = db;
        _blob = blob;
        _accessGuard = accessGuard;
        _eventSpine = eventSpine;
        _clock = clock;
    }

    public async Task<IReadOnlyList<AttachmentDto>?> ListAsync(string recordId, Guid userId, CancellationToken cancellationToken)
    {
        // Gate first so a forbidden record is a 403, not an empty 200 (BS §22.6).
        var record = await ReadRecordAsync(recordId, userId, cancellationToken).ConfigureAwait(false);
        if (record is null)
        {
            return null;
        }

        var rows = await _db.Set<AttachmentListRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetAttachmentsForRecord @RecordId, @UserId",
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return rows.Select(MapListRow).ToList();
    }

    public async Task<IReadOnlyList<WorkspaceAttachmentExportRow>> QueryWorkspaceAttachmentsAsync(
        Guid workspaceId, int page, int pageSize, CancellationToken cancellationToken)
    {
        // Workspace-scoped read; ExportService has already gated the caller's Viewer membership on
        // @WorkspaceId (BS §22.4 — export never widens access). No further per-user filter here.
        return await _db.Set<WorkspaceAttachmentExportRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetAttachmentsForWorkspace @WorkspaceId, @Page, @PageSize",
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@Page", page),
                new SqlParameter("@PageSize", pageSize))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task<UploadResult> UploadAsync(
        string recordId, string fileName, string contentType, long sizeBytes, Stream content,
        Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var record = await ReadRecordAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (record is null
            || !await _accessGuard.HasWorkspaceLevelAsync(actorUserId, record.WorkspaceId, WorkspaceLevel.Member, cancellationToken).ConfigureAwait(false))
        {
            return new UploadResult(AttachmentOutcome.Denied);
        }

        var attachmentId = Guid.NewGuid();
        var blobPath = BuildBlobPath(record.WorkspaceId, recordId, attachmentId, fileName);

        // Blob first: a failure here creates no SQL row (api-blob-attachments.md error chain → 502).
        try
        {
            await _blob.UploadAsync(blobPath, content, contentType, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return new UploadResult(AttachmentOutcome.BlobFailed);
        }

        try
        {
            var inserted = await InsertRowAsync(
                attachmentId, recordId, record.WorkspaceId, fileName, contentType, sizeBytes,
                blobPath, isLink: false, externalUrl: null, actorUserId, cancellationToken).ConfigureAwait(false);

            if (!inserted)
            {
                // The proc's own gate denied the write (defense in depth) — clean up the orphan blob.
                await SafeDeleteBlobAsync(blobPath).ConfigureAwait(false);
                return new UploadResult(AttachmentOutcome.Denied);
            }
        }
        catch (SqlException)
        {
            // SQL failed after a successful blob upload — delete the orphaned blob, return 500.
            await SafeDeleteBlobAsync(blobPath).ConfigureAwait(false);
            return new UploadResult(AttachmentOutcome.PersistFailed);
        }

        await EmitAsync("attachment.added", record.WorkspaceId, recordId, actorUserId,
            new { attachmentId, isLink = false }, operationId, cancellationToken).ConfigureAwait(false);

        return new UploadResult(
            AttachmentOutcome.Success,
            BuildDto(attachmentId, recordId, fileName, contentType, sizeBytes, isLink: false, externalUrl: null, actorUserId));
    }

    public async Task<AttachmentDto?> LinkAsync(
        string recordId, string url, string title, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var record = await ReadRecordAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (record is null
            || !await _accessGuard.HasWorkspaceLevelAsync(actorUserId, record.WorkspaceId, WorkspaceLevel.Member, cancellationToken).ConfigureAwait(false))
        {
            return null;
        }

        var attachmentId = Guid.NewGuid();
        var inserted = await InsertRowAsync(
            attachmentId, recordId, record.WorkspaceId, title, ExternalLinkContentType, sizeBytes: 0,
            ExternalLinkBlobPath, isLink: true, externalUrl: url, actorUserId, cancellationToken).ConfigureAwait(false);

        if (!inserted)
        {
            return null;
        }

        await EmitAsync("attachment.added", record.WorkspaceId, recordId, actorUserId,
            new { attachmentId, isLink = true }, operationId, cancellationToken).ConfigureAwait(false);

        return BuildDto(attachmentId, recordId, title, ExternalLinkContentType, sizeBytes: 0, isLink: true, externalUrl: url, actorUserId);
    }

    public async Task<AttachmentDownload?> GetForDownloadAsync(Guid attachmentId, Guid userId, CancellationToken cancellationToken)
    {
        var row = await ReadAttachmentAsync(attachmentId, userId, cancellationToken).ConfigureAwait(false);
        return row is null
            ? null
            : new AttachmentDownload(row.IsLink, row.ExternalUrl, row.BlobPath, row.FileName, row.ContentType);
    }

    public Task<Stream> GetContentStreamAsync(AttachmentDownload download, CancellationToken cancellationToken) =>
        _blob.DownloadAsync(download.BlobPath, cancellationToken);

    public async Task<bool> DeleteAsync(Guid attachmentId, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        // Resolve first (gated) so the removal event can be keyed to the real record + workspace, and
        // a forbidden/non-existent attachment is a uniform 403 (false) without disclosing existence.
        var row = await ReadAttachmentAsync(attachmentId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (row is null)
        {
            return false;
        }

        var deletedParameter = new SqlParameter("@Deleted", SqlDbType.Bit) { Direction = ParameterDirection.Output };

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_DeleteAttachment @AttachmentId, @ActorUserId, @Deleted OUTPUT",
            new[]
            {
                new SqlParameter("@AttachmentId", attachmentId),
                new SqlParameter("@ActorUserId", actorUserId),
                deletedParameter,
            },
            cancellationToken).ConfigureAwait(false);

        if (deletedParameter.Value is not bool deleted || !deleted)
        {
            // Lost a race (already deleted) or the proc's own gate denied — 403, no event.
            return false;
        }

        await EmitAsync("attachment.removed", row.WorkspaceId, row.RecordId, actorUserId,
            new { attachmentId }, operationId, cancellationToken).ConfigureAwait(false);
        return true;
    }

    private async Task<AttachmentDownloadRow?> ReadAttachmentAsync(Guid attachmentId, Guid userId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<AttachmentDownloadRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetAttachmentById @AttachmentId, @UserId",
                new SqlParameter("@AttachmentId", attachmentId),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return rows.FirstOrDefault();
    }

    private async Task<bool> InsertRowAsync(
        Guid attachmentId, string recordId, Guid workspaceId, string fileName, string contentType, long sizeBytes,
        string blobPath, bool isLink, string? externalUrl, Guid actorUserId, CancellationToken cancellationToken)
    {
        var insertedParameter = new SqlParameter("@Inserted", SqlDbType.Bit) { Direction = ParameterDirection.Output };

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_CreateAttachment @AttachmentId, @RecordId, @WorkspaceId, @FileName, @ContentType, " +
            "@SizeBytes, @BlobPath, @IsLink, @ExternalUrl, @ActorUserId, @Inserted OUTPUT",
            new[]
            {
                new SqlParameter("@AttachmentId", attachmentId),
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@FileName", fileName),
                new SqlParameter("@ContentType", contentType),
                new SqlParameter("@SizeBytes", sizeBytes),
                new SqlParameter("@BlobPath", blobPath),
                new SqlParameter("@IsLink", isLink),
                new SqlParameter("@ExternalUrl", (object?)externalUrl ?? DBNull.Value),
                new SqlParameter("@ActorUserId", actorUserId),
                insertedParameter,
            },
            cancellationToken).ConfigureAwait(false);

        return insertedParameter.Value is bool inserted && inserted;
    }

    private async Task<RequestRow?> ReadRecordAsync(string recordId, Guid userId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<RequestRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetRequestByIdForUser @RecordId, @UserId",
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return rows.FirstOrDefault();
    }

    private async Task SafeDeleteBlobAsync(string blobPath)
    {
        try
        {
            await _blob.DeleteAsync(blobPath, CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception)
        {
            // Best-effort cleanup — a leaked blob is reclaimed by the retention policy; never mask the
            // original failure the caller is already being told about.
        }
    }

    private static string BuildBlobPath(Guid workspaceId, string recordId, Guid attachmentId, string fileName) =>
        $"{workspaceId:D}/{recordId}/{attachmentId:D}/{fileName}";

    private AttachmentDto MapListRow(AttachmentListRow row) => new(
        row.AttachmentId,
        row.RecordId,
        row.ObjectType,
        row.FileName,
        row.ContentType,
        row.SizeBytes,
        row.IsLink,
        row.ExternalUrl,
        DateTime.SpecifyKind(row.CreatedAt, DateTimeKind.Utc),
        ParseUserId(row.CreatedBy),
        ContentUrl(row.AttachmentId));

    private AttachmentDto BuildDto(
        Guid attachmentId, string recordId, string fileName, string contentType, long sizeBytes,
        bool isLink, string? externalUrl, Guid actorUserId) => new(
        attachmentId,
        recordId,
        "Request",
        fileName,
        contentType,
        sizeBytes,
        isLink,
        externalUrl,
        _clock.UtcNow.UtcDateTime,
        actorUserId,
        ContentUrl(attachmentId));

    private static string ContentUrl(Guid attachmentId) => $"/api/v1/attachments/{attachmentId:D}/content";

    /// <summary>CreatedBy stores the actor's oid as a string; parse it back, tolerating legacy values.</summary>
    private static Guid ParseUserId(string createdBy) =>
        Guid.TryParse(createdBy, out var id) ? id : Guid.Empty;

    private async Task EmitAsync(
        string eventType, Guid workspaceId, string recordId, Guid actorUserId, object payloadObject, string operationId, CancellationToken cancellationToken)
    {
        var payload = JsonSerializer.Serialize(payloadObject, JsonOptions);
        var envelope = new EventEnvelope(
            Guid.NewGuid(), eventType, workspaceId, recordId, actorUserId, _clock.UtcNow, payload, operationId);
        await _eventSpine.EmitAsync(envelope, cancellationToken).ConfigureAwait(false);
    }
}
