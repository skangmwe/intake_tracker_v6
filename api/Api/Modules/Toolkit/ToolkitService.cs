// Toolkit service (Slice 29 — v2-reconciliation.md §API deltas Toolkit, build spec §2.6 / §19). Owns
// the query / detail / create / patch / retire / restore / attachment-download lifecycle for the
// reference-local Toolkit object. Access is resolved server-side on every path: reads are gated
// inside usp_GetToolkitItemForUser (null → 403, never disclose existence — BS §22.6); writes require
// Member+ on the item's workspace. An item may carry a single uploaded file, streamed straight to
// Blob (never buffered) with the api-blob-attachments.md error chain: a blob failure creates no SQL
// row (502); a SQL failure after a successful blob upload deletes the orphaned blob (500). Free-text
// values and file names are Confidential — never logged; event payloads carry ids/enums only
// (api-pii-handling.md).

using System.Data;
using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Storage;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Toolkit;

/// <summary>Outcome of a Toolkit create/patch write.</summary>
public enum ToolkitWriteOutcome
{
    Success,
    /// <summary>The caller is not a Member+ of the item's workspace, or the item is not visible (403).</summary>
    Denied,
    /// <summary>Stale ETag on a PATCH — 409.</summary>
    Stale,
    /// <summary>Blob upload failed after SDK retries — no SQL row was created / updated (→ 502).</summary>
    BlobFailed,
    /// <summary>SQL failed after a successful blob upload — the blob was deleted (→ 500).</summary>
    PersistFailed,
}

/// <summary>Outcome of an attachment download resolution.</summary>
public enum ToolkitDownloadOutcome
{
    Success,
    /// <summary>The item is not visible to the caller (403, never disclose).</summary>
    Denied,
    /// <summary>The item is visible but carries no uploaded file (404).</summary>
    NoAttachment,
}

/// <summary>An uploaded file the controller has validated and opened, ready to stream to blob.</summary>
public sealed record ToolkitUpload(string FileName, string ContentType, long SizeBytes, Stream Content);

public sealed record ToolkitWriteResult(ToolkitWriteOutcome Outcome, ToolkitItemDto? Item = null);

/// <summary>What the download endpoint needs to stream one item's file.</summary>
public sealed record ToolkitDownload(string BlobPath, string FileName, string ContentType);

public sealed record ToolkitDownloadResult(ToolkitDownloadOutcome Outcome, ToolkitDownload? Download = null);

public interface IToolkitService
{
    /// <summary>The S43 list. Null → 403 (caller is not a member of the workspace).</summary>
    Task<PaginatedResponse<ToolkitItemListRowDto>?> QueryAsync(
        Guid workspaceId, Guid userId, PaginatedQuery query, CancellationToken cancellationToken);

    /// <summary>The full item. Null → 403 (forbidden / non-existent).</summary>
    Task<ToolkitItemDto?> GetByIdAsync(string recordId, Guid userId, CancellationToken cancellationToken);

    Task<ToolkitWriteResult> CreateAsync(
        Guid workspaceId, ToolkitItemCreateRequest request, ToolkitUpload? upload,
        Guid actorUserId, string operationId, CancellationToken cancellationToken);

    Task<ToolkitWriteResult> PatchAsync(
        string recordId, ToolkitItemPatchRequest request, ToolkitUpload? upload, string? ifMatch,
        Guid actorUserId, string operationId, CancellationToken cancellationToken);

    /// <summary>Soft-delete (retire). True → retired; false → 403 (forbidden / non-existent / already retired).</summary>
    Task<bool> RetireAsync(string recordId, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    /// <summary>Restore a retired item. True → restored; false → 403 (forbidden / non-existent / already live).</summary>
    Task<bool> RestoreAsync(string recordId, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    Task<ToolkitDownloadResult> GetForDownloadAsync(string recordId, Guid userId, CancellationToken cancellationToken);

    Task<Stream> GetContentStreamAsync(ToolkitDownload download, CancellationToken cancellationToken);
}

public sealed class ToolkitService : IToolkitService
{
    private const int StaleRecordError = 50040;   // usp_PatchToolkitItem — If-Match mismatch → 409.
    private const int NotFoundError = 50043;      // item row not found → 403 / not-found.

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly IBlobStreamer _blob;
    private readonly IAccessGuard _accessGuard;
    private readonly IEventSpine _eventSpine;
    private readonly IClock _clock;

    public ToolkitService(
        AppDbContext db, IBlobStreamer blob, IAccessGuard accessGuard, IEventSpine eventSpine, IClock clock)
    {
        _db = db;
        _blob = blob;
        _accessGuard = accessGuard;
        _eventSpine = eventSpine;
        _clock = clock;
    }

    // ─── List read (two result sets → raw ADO.NET) ─────────────────────────────

    public async Task<PaginatedResponse<ToolkitItemListRowDto>?> QueryAsync(
        Guid workspaceId, Guid userId, PaginatedQuery query, CancellationToken cancellationToken)
    {
        var page = query.Page < 1 ? 1 : query.Page;
        var pageSize = query.PageSize < 1 ? 20 : query.PageSize > 100 ? 100 : query.PageSize;

        // One authoritative access check: a non-member gets 403 (null → controller maps it).
        if (!await _accessGuard.HasWorkspaceLevelAsync(userId, workspaceId, WorkspaceLevel.Viewer, cancellationToken).ConfigureAwait(false))
        {
            return null;
        }

        var filtersJson = BuildFiltersJson(query.Filters);
        var (sortColumn, sortDirection) = ResolveSort(query.Sort);

        var rows = new List<ToolkitItemListRowDto>();
        var totalCount = 0;

        var connection = _db.Database.GetDbConnection();
        var mustClose = connection.State != ConnectionState.Open;
        if (mustClose)
        {
            await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        }

        try
        {
            using var command = connection.CreateCommand();
            command.CommandText =
                "EXEC dbo.usp_QueryToolkit @WorkspaceId, @Page, @PageSize, @FiltersJson, @SortColumn, @SortDir";
            command.Parameters.Add(new SqlParameter("@WorkspaceId", workspaceId.ToString()));
            command.Parameters.Add(new SqlParameter("@Page", page));
            command.Parameters.Add(new SqlParameter("@PageSize", pageSize));
            command.Parameters.Add(new SqlParameter("@FiltersJson", (object?)filtersJson ?? DBNull.Value));
            command.Parameters.Add(new SqlParameter("@SortColumn", sortColumn));
            command.Parameters.Add(new SqlParameter("@SortDir", sortDirection));

            await using var reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);

            var recordIdIndex = reader.GetOrdinal("RecordId");
            var kindIndex = reader.GetOrdinal("Kind");
            var statusIndex = reader.GetOrdinal("Status");
            var nameIndex = reader.GetOrdinal("Name");
            var oneLinerIndex = reader.GetOrdinal("OneLiner");
            var maintainerIndex = reader.GetOrdinal("Maintainer");
            var hasAttachmentIndex = reader.GetOrdinal("HasAttachment");
            var updatedByIndex = reader.GetOrdinal("UpdatedBy");
            var updatedAtIndex = reader.GetOrdinal("UpdatedAt");
            var rowVerIndex = reader.GetOrdinal("RowVer");

            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                rows.Add(new ToolkitItemListRowDto(
                    Id: reader.GetString(recordIdIndex),
                    Kind: reader.GetString(kindIndex),
                    Status: reader.GetString(statusIndex),
                    Name: reader.GetString(nameIndex),
                    OneLiner: reader.IsDBNull(oneLinerIndex) ? null : reader.GetString(oneLinerIndex),
                    Maintainer: reader.IsDBNull(maintainerIndex) ? null : reader.GetString(maintainerIndex),
                    HasAttachment: reader.GetBoolean(hasAttachmentIndex),
                    LastModifiedAt: DateTime.SpecifyKind(reader.GetDateTime(updatedAtIndex), DateTimeKind.Utc),
                    LastModifiedBy: reader.IsDBNull(updatedByIndex) ? string.Empty : reader.GetString(updatedByIndex),
                    ETag: Convert.ToBase64String((byte[])reader.GetValue(rowVerIndex))));
            }

            if (await reader.NextResultAsync(cancellationToken).ConfigureAwait(false)
                && await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                totalCount = reader.GetInt32(0);
            }
        }
        finally
        {
            if (mustClose)
            {
                await connection.CloseAsync().ConfigureAwait(false);
            }
        }

        return new PaginatedResponse<ToolkitItemListRowDto>(rows, totalCount, page, pageSize);
    }

    public async Task<ToolkitItemDto?> GetByIdAsync(string recordId, Guid userId, CancellationToken cancellationToken)
    {
        var row = await ReadRowAsync(recordId, userId, cancellationToken).ConfigureAwait(false);
        return row is null ? null : MapRow(row);
    }

    // ─── Create ────────────────────────────────────────────────────────────────

    public async Task<ToolkitWriteResult> CreateAsync(
        Guid workspaceId, ToolkitItemCreateRequest request, ToolkitUpload? upload,
        Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(actorUserId, workspaceId, WorkspaceLevel.Member, cancellationToken).ConfigureAwait(false))
        {
            return new ToolkitWriteResult(ToolkitWriteOutcome.Denied);
        }

        string? blobPath = null;
        if (upload is not null)
        {
            blobPath = BuildBlobPath(workspaceId, Guid.NewGuid(), upload.FileName);
            try
            {
                await _blob.UploadAsync(blobPath, upload.Content, upload.ContentType, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                return new ToolkitWriteResult(ToolkitWriteOutcome.BlobFailed);
            }
        }

        var recordIdParameter = new SqlParameter("@RecordId", SqlDbType.NVarChar, 20)
        {
            Direction = ParameterDirection.Output,
        };

        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_CreateToolkitItem @WorkspaceId, @Kind, @Status, @Name, @OneLiner, @Description, " +
                "@Maintainer, @HowTo, @BodyMarkdown, @AttachmentBlobPath, @AttachmentFileName, " +
                "@AttachmentContentType, @AttachmentSizeBytes, @ActorUserId, @RecordId OUTPUT",
                BuildWriteParameters(workspaceId, request.Kind!, request.Status, request.Name!, request.OneLiner,
                    request.Description, request.Maintainer, request.HowTo, request.BodyMarkdown, blobPath, upload, actorUserId)
                    .Append(recordIdParameter).ToArray(),
                cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException)
        {
            if (blobPath is not null)
            {
                await SafeDeleteBlobAsync(blobPath).ConfigureAwait(false);
            }

            return new ToolkitWriteResult(ToolkitWriteOutcome.PersistFailed);
        }

        var recordId = (string)recordIdParameter.Value!;
        await EmitAsync("toolkit.created", workspaceId, recordId, actorUserId, operationId, cancellationToken).ConfigureAwait(false);

        var dto = await GetByIdAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        return new ToolkitWriteResult(ToolkitWriteOutcome.Success, dto);
    }

    // ─── Patch ─────────────────────────────────────────────────────────────────

    public async Task<ToolkitWriteResult> PatchAsync(
        string recordId, ToolkitItemPatchRequest request, ToolkitUpload? upload, string? ifMatch,
        Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var row = await ReadRowAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (row is null)
        {
            return new ToolkitWriteResult(ToolkitWriteOutcome.Denied);
        }

        if (!await _accessGuard.HasWorkspaceLevelAsync(actorUserId, row.WorkspaceId, WorkspaceLevel.Member, cancellationToken).ConfigureAwait(false))
        {
            return new ToolkitWriteResult(ToolkitWriteOutcome.Denied);
        }

        if (!TryDecodeRowVer(ifMatch, out var rowVer))
        {
            return new ToolkitWriteResult(ToolkitWriteOutcome.Stale);
        }

        // Resolve the attachment columns: a new upload replaces the file, RemoveAttachment clears it,
        // otherwise the existing pointer is preserved. Old / orphaned blobs are cleaned up after the
        // SQL write settles (api-blob-attachments.md error chain).
        var attachment = row.ToAttachmentColumns();
        string? newBlobPath = null;
        string? blobToDeleteOnSuccess = null;

        if (upload is not null)
        {
            newBlobPath = BuildBlobPath(row.WorkspaceId, Guid.NewGuid(), upload.FileName);
            try
            {
                await _blob.UploadAsync(newBlobPath, upload.Content, upload.ContentType, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                return new ToolkitWriteResult(ToolkitWriteOutcome.BlobFailed);
            }

            blobToDeleteOnSuccess = row.AttachmentBlobPath;   // remove the previous file after success
            attachment = new AttachmentColumns(newBlobPath, upload.FileName, upload.ContentType, upload.SizeBytes);
        }
        else if (request.RemoveAttachment)
        {
            blobToDeleteOnSuccess = row.AttachmentBlobPath;
            attachment = AttachmentColumns.None;
        }

        var kind = request.Kind ?? row.Kind;
        var status = request.Status ?? row.Status;
        var name = request.Name ?? row.Name;
        var oneLiner = request.OneLiner ?? row.OneLiner;
        var description = request.Description ?? row.Description;
        var maintainer = request.Maintainer ?? row.Maintainer;
        var howTo = request.HowTo ?? row.HowTo;
        var bodyMarkdown = request.BodyMarkdown ?? row.BodyMarkdown;

        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_PatchToolkitItem @RecordId, @WorkspaceId, @Kind, @Status, @Name, @OneLiner, " +
                "@Description, @Maintainer, @HowTo, @BodyMarkdown, @AttachmentBlobPath, @AttachmentFileName, " +
                "@AttachmentContentType, @AttachmentSizeBytes, @IfMatchRowVer, @ActorUserId",
                new[]
                {
                    new SqlParameter("@RecordId", recordId),
                    new SqlParameter("@WorkspaceId", row.WorkspaceId),
                    new SqlParameter("@Kind", kind),
                    new SqlParameter("@Status", status),
                    new SqlParameter("@Name", name),
                    new SqlParameter("@OneLiner", (object?)oneLiner ?? DBNull.Value),
                    new SqlParameter("@Description", (object?)description ?? DBNull.Value),
                    new SqlParameter("@Maintainer", (object?)maintainer ?? DBNull.Value),
                    new SqlParameter("@HowTo", (object?)howTo ?? DBNull.Value),
                    new SqlParameter("@BodyMarkdown", (object?)bodyMarkdown ?? DBNull.Value),
                    new SqlParameter("@AttachmentBlobPath", (object?)attachment.BlobPath ?? DBNull.Value),
                    new SqlParameter("@AttachmentFileName", (object?)attachment.FileName ?? DBNull.Value),
                    new SqlParameter("@AttachmentContentType", (object?)attachment.ContentType ?? DBNull.Value),
                    new SqlParameter("@AttachmentSizeBytes", (object?)attachment.SizeBytes ?? DBNull.Value),
                    new SqlParameter("@IfMatchRowVer", SqlDbType.VarBinary, 8) { Value = rowVer },
                    new SqlParameter("@ActorUserId", actorUserId.ToString()),
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException exception) when (exception.Number is StaleRecordError or NotFoundError)
        {
            // The write did not land — drop any blob we just uploaded so it does not orphan.
            if (newBlobPath is not null)
            {
                await SafeDeleteBlobAsync(newBlobPath).ConfigureAwait(false);
            }

            return new ToolkitWriteResult(exception.Number == StaleRecordError ? ToolkitWriteOutcome.Stale : ToolkitWriteOutcome.Denied);
        }

        if (blobToDeleteOnSuccess is not null)
        {
            await SafeDeleteBlobAsync(blobToDeleteOnSuccess).ConfigureAwait(false);
        }

        await EmitAsync("toolkit.updated", row.WorkspaceId, recordId, actorUserId, operationId, cancellationToken).ConfigureAwait(false);
        var dto = await GetByIdAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        return new ToolkitWriteResult(ToolkitWriteOutcome.Success, dto);
    }

    // ─── Retire / Restore (self-gating procs) ──────────────────────────────────

    public async Task<bool> RetireAsync(string recordId, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var retiredParameter = new SqlParameter("@Retired", SqlDbType.Bit) { Direction = ParameterDirection.Output };

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_RetireToolkitItem @RecordId, @UserId, @ActorUserId, @Retired OUTPUT",
            BuildFlipParameters(recordId, actorUserId, retiredParameter),
            cancellationToken).ConfigureAwait(false);

        return await AfterFlipAsync(retiredParameter, "toolkit.retired", recordId, actorUserId, operationId, cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task<bool> RestoreAsync(string recordId, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var restoredParameter = new SqlParameter("@Restored", SqlDbType.Bit) { Direction = ParameterDirection.Output };

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_RestoreToolkitItem @RecordId, @UserId, @ActorUserId, @Restored OUTPUT",
            BuildFlipParameters(recordId, actorUserId, restoredParameter),
            cancellationToken).ConfigureAwait(false);

        return await AfterFlipAsync(restoredParameter, "toolkit.restored", recordId, actorUserId, operationId, cancellationToken)
            .ConfigureAwait(false);
    }

    private static SqlParameter[] BuildFlipParameters(string recordId, Guid actorUserId, SqlParameter changedOutput) =>
        new[]
        {
            new SqlParameter("@RecordId", recordId),
            new SqlParameter("@UserId", actorUserId),
            new SqlParameter("@ActorUserId", actorUserId.ToString()),
            changedOutput,
        };

    private async Task<bool> AfterFlipAsync(
        SqlParameter changedOutput, string eventType, string recordId, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        if (changedOutput.Value is not bool changed || !changed)
        {
            return false;
        }

        // The retire/restore proc self-gates on membership; the event anchors on the item's workspace,
        // resolved from the row (retired reads are excluded, so read it un-gated by id for the event
        // only — best-effort, never blocks the response).
        var workspaceId = await ResolveWorkspaceIdAsync(recordId, cancellationToken).ConfigureAwait(false);
        if (workspaceId is { } ws)
        {
            await EmitAsync(eventType, ws, recordId, actorUserId, operationId, cancellationToken).ConfigureAwait(false);
        }

        return true;
    }

    // ─── Attachment download ───────────────────────────────────────────────────

    public async Task<ToolkitDownloadResult> GetForDownloadAsync(string recordId, Guid userId, CancellationToken cancellationToken)
    {
        var row = await ReadRowAsync(recordId, userId, cancellationToken).ConfigureAwait(false);
        if (row is null)
        {
            return new ToolkitDownloadResult(ToolkitDownloadOutcome.Denied);
        }

        if (string.IsNullOrEmpty(row.AttachmentBlobPath))
        {
            return new ToolkitDownloadResult(ToolkitDownloadOutcome.NoAttachment);
        }

        return new ToolkitDownloadResult(
            ToolkitDownloadOutcome.Success,
            new ToolkitDownload(row.AttachmentBlobPath, row.AttachmentFileName ?? "download",
                row.AttachmentContentType ?? "application/octet-stream"));
    }

    public Task<Stream> GetContentStreamAsync(ToolkitDownload download, CancellationToken cancellationToken) =>
        _blob.DownloadAsync(download.BlobPath, cancellationToken);

    // ─── Reads & mapping ───────────────────────────────────────────────────────

    private async Task<ToolkitItemRow?> ReadRowAsync(string recordId, Guid userId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<ToolkitItemRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetToolkitItemForUser @RecordId, @UserId",
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return rows.FirstOrDefault();
    }

    private async Task<Guid?> ResolveWorkspaceIdAsync(string recordId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<ToolkitWorkspaceRow>()
            .FromSqlRaw(
                "SELECT TOP (1) WorkspaceId FROM dbo.ToolkitItem WHERE RecordId = @RecordId",
                new SqlParameter("@RecordId", recordId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return rows.FirstOrDefault()?.WorkspaceId;
    }

    private ToolkitItemDto MapRow(ToolkitItemRow row)
    {
        ToolkitAttachmentInfoDto? attachment = string.IsNullOrEmpty(row.AttachmentBlobPath)
            ? null
            : new ToolkitAttachmentInfoDto(
                row.AttachmentFileName ?? "download",
                row.AttachmentContentType ?? "application/octet-stream",
                row.AttachmentSizeBytes ?? 0,
                $"/api/v1/toolkit/{row.RecordId}/attachment");

        return new ToolkitItemDto(
            Id: row.RecordId,
            WorkspaceId: row.WorkspaceId,
            Kind: row.Kind,
            Status: row.Status,
            Name: row.Name,
            OneLiner: row.OneLiner,
            Description: row.Description,
            Maintainer: row.Maintainer,
            HowTo: row.HowTo,
            BodyMarkdown: row.BodyMarkdown,
            Attachment: attachment,
            LastModifiedAt: DateTime.SpecifyKind(row.UpdatedAt, DateTimeKind.Utc),
            LastModifiedBy: row.UpdatedBy,
            CreatedAt: DateTime.SpecifyKind(row.CreatedAt, DateTimeKind.Utc),
            CreatedBy: row.CreatedBy,
            IsRetired: row.IsDeleted,
            ETag: Convert.ToBase64String(row.RowVer));
    }

    // ─── Blob + filter/sort helpers ────────────────────────────────────────────

    private static SqlParameter[] BuildWriteParameters(
        Guid workspaceId, string kind, string? status, string name, string? oneLiner, string? description,
        string? maintainer, string? howTo, string? bodyMarkdown, string? blobPath, ToolkitUpload? upload, Guid actorUserId) =>
        new[]
        {
            new SqlParameter("@WorkspaceId", workspaceId),
            new SqlParameter("@Kind", kind),
            new SqlParameter("@Status", (object?)status ?? DBNull.Value),
            new SqlParameter("@Name", name),
            new SqlParameter("@OneLiner", (object?)oneLiner ?? DBNull.Value),
            new SqlParameter("@Description", (object?)description ?? DBNull.Value),
            new SqlParameter("@Maintainer", (object?)maintainer ?? DBNull.Value),
            new SqlParameter("@HowTo", (object?)howTo ?? DBNull.Value),
            new SqlParameter("@BodyMarkdown", (object?)bodyMarkdown ?? DBNull.Value),
            new SqlParameter("@AttachmentBlobPath", (object?)blobPath ?? DBNull.Value),
            new SqlParameter("@AttachmentFileName", (object?)upload?.FileName ?? DBNull.Value),
            new SqlParameter("@AttachmentContentType", (object?)upload?.ContentType ?? DBNull.Value),
            new SqlParameter("@AttachmentSizeBytes", (object?)upload?.SizeBytes ?? DBNull.Value),
            new SqlParameter("@ActorUserId", actorUserId.ToString()),
        };

    private static string BuildBlobPath(Guid workspaceId, Guid blobId, string fileName) =>
        $"toolkit/{workspaceId:D}/{blobId:D}/{fileName}";

    private async Task SafeDeleteBlobAsync(string blobPath)
    {
        try
        {
            await _blob.DeleteAsync(blobPath, CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception)
        {
            // Best-effort cleanup — a leaked blob is reclaimed by retention; never mask the caller's result.
        }
    }

    /// <summary>Translate the generic FilterClause map into the shape usp_QueryToolkit parses.</summary>
    private static string? BuildFiltersJson(Dictionary<string, JsonElement>? filters)
    {
        if (filters is null || filters.Count == 0)
        {
            return null;
        }

        var output = new Dictionary<string, object?>(StringComparer.Ordinal);
        AddSelectFilter(filters, "kind", "kind", output);
        AddSelectFilter(filters, "status", "status", output);
        AddSelectFilter(filters, "maintainer", "maintainer", output);
        AddTextFilter(filters, "name", "nameContains", output);
        AddTextFilter(filters, "search", "search", output);

        return output.Count == 0 ? null : JsonSerializer.Serialize(output, JsonOptions);
    }

    private static void AddSelectFilter(
        Dictionary<string, JsonElement> filters, string sourceKey, string targetKey, Dictionary<string, object?> output)
    {
        if (filters.TryGetValue(sourceKey, out var clause) && clause.ValueKind == JsonValueKind.Object
            && clause.TryGetProperty("values", out var values) && values.ValueKind == JsonValueKind.Array)
        {
            var list = values.EnumerateArray()
                .Where(value => value.ValueKind == JsonValueKind.String)
                .Select(value => value.GetString())
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .ToList();
            if (list.Count > 0)
            {
                output[targetKey] = list;
            }
        }
    }

    private static void AddTextFilter(
        Dictionary<string, JsonElement> filters, string sourceKey, string targetKey, Dictionary<string, object?> output)
    {
        if (filters.TryGetValue(sourceKey, out var clause) && clause.ValueKind == JsonValueKind.Object
            && clause.TryGetProperty("contains", out var contains) && contains.ValueKind == JsonValueKind.String)
        {
            var text = contains.GetString();
            if (!string.IsNullOrWhiteSpace(text))
            {
                output[targetKey] = text;
            }
        }
    }

    private static (string Column, string Direction) ResolveSort(IReadOnlyList<SortSpec>? sort)
    {
        var first = sort?.FirstOrDefault(spec => !string.IsNullOrWhiteSpace(spec.Column));
        var direction = string.Equals(first?.Direction, "asc", StringComparison.OrdinalIgnoreCase) ? "asc" : "desc";
        var column = (first?.Column?.ToLowerInvariant()) switch
        {
            "id" => "id",
            "name" => "name",
            "kind" or "type" => "type",
            "status" => "status",
            "maintainer" => "maintainer",
            "updatedat" or "updated" or "lastmodifiedat" => "updated",
            _ => "updated",
        };
        return (column, direction);
    }

    private async Task EmitAsync(
        string eventType, Guid workspaceId, string recordId, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var envelope = new EventEnvelope(
            Guid.NewGuid(), eventType, workspaceId, recordId, actorUserId, _clock.UtcNow, "{}", operationId);
        await _eventSpine.EmitAsync(envelope, cancellationToken).ConfigureAwait(false);
    }

    private static bool TryDecodeRowVer(string? eTag, out byte[] rowVer)
    {
        rowVer = Array.Empty<byte>();
        if (string.IsNullOrWhiteSpace(eTag))
        {
            return false;
        }

        try
        {
            var bytes = Convert.FromBase64String(eTag);
            if (bytes.Length != 8)
            {
                return false;
            }

            rowVer = bytes;
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}

/// <summary>The four attachment pointer columns, moved together as a unit on patch.</summary>
internal sealed record AttachmentColumns(string? BlobPath, string? FileName, string? ContentType, long? SizeBytes)
{
    public static readonly AttachmentColumns None = new(null, null, null, null);
}

internal static class ToolkitItemRowExtensions
{
    public static AttachmentColumns ToAttachmentColumns(this ToolkitItemRow row) =>
        new(row.AttachmentBlobPath, row.AttachmentFileName, row.AttachmentContentType, row.AttachmentSizeBytes);
}

/// <summary>Keyless one-column projection for the retire/restore event's workspace lookup.</summary>
public sealed class ToolkitWorkspaceRow
{
    public Guid WorkspaceId { get; set; }
}
