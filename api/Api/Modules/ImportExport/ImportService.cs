// Import service (Slice 16 — api-contracts.md §17, BS §13). Owns the upload hand-off and the status
// read; the row-by-row processing lives in ImportRunner (driven by ImportProcessor off the request
// thread). StartAsync streams the CSV directly to Blob (never buffering the whole file in memory —
// api-blob-attachments.md), records the job via the admin-gated usp_CreateImport (a non-admin inserts
// no row -> 403, never disclosing existence, BS §22.6), enqueues the job, and returns so the endpoint
// can answer 202 (api-performance.md — no long-running work inline). GetStatusAsync reads the job +
// its reasoned rows through admin-gated procs. File names and reason messages are Confidential/PII-free
// — never logged (api-pii-handling.md).

using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Shared.Storage;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

public enum ImportStartOutcome
{
    Success,
    /// <summary>Caller is not a WorkspaceAdmin of the target workspace (or it doesn't exist) — 403.</summary>
    Denied,
    /// <summary>The CSV failed to stream to Blob after SDK retries — no job row was created (→ 502).</summary>
    BlobFailed,
}

public sealed record ImportStartResult(ImportStartOutcome Outcome, Guid ImportId = default);

public interface IImportService
{
    Task<ImportStartResult> StartAsync(
        Guid workspaceId, string fileName, Stream content, Guid userId, string operationId,
        string objectType, string? mappingJson, ImportMode mode, CancellationToken cancellationToken);

    /// <summary>Status + per-row report. Null → 403 (forbidden/non-existent import — never disclosed).</summary>
    Task<ImportStatusResponse?> GetStatusAsync(Guid importId, Guid userId, CancellationToken cancellationToken);
}

public sealed class ImportService : IImportService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly IBlobStreamer _blob;
    private readonly IImportQueue _queue;

    public ImportService(AppDbContext db, IBlobStreamer blob, IImportQueue queue)
    {
        _db = db;
        _blob = blob;
        _queue = queue;
    }

    public async Task<ImportStartResult> StartAsync(
        Guid workspaceId, string fileName, Stream content, Guid userId, string operationId,
        string objectType, string? mappingJson, ImportMode mode, CancellationToken cancellationToken)
    {
        var importId = Guid.NewGuid();
        var blobPath = $"imports/{workspaceId:D}/{importId:D}.csv";

        // Blob first: a failure here creates no SQL job row (→ 502, api-blob-attachments.md error chain).
        try
        {
            await _blob.UploadAsync(blobPath, content, "text/csv", cancellationToken).ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return new ImportStartResult(ImportStartOutcome.BlobFailed);
        }

        var createdParameter = new SqlParameter("@Created", System.Data.SqlDbType.Bit)
        {
            Direction = System.Data.ParameterDirection.Output,
        };

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_CreateImport @ImportId, @WorkspaceId, @FileName, @BlobPath, @StartedByUserId, @Created OUTPUT",
            new[]
            {
                new SqlParameter("@ImportId", importId),
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@FileName", fileName),
                new SqlParameter("@BlobPath", blobPath),
                new SqlParameter("@StartedByUserId", userId),
                createdParameter,
            },
            cancellationToken).ConfigureAwait(false);

        if (createdParameter.Value is not bool created || !created)
        {
            // The admin gate denied the write — clean up the orphaned CSV blob, answer 403.
            await SafeDeleteBlobAsync(blobPath).ConfigureAwait(false);
            return new ImportStartResult(ImportStartOutcome.Denied);
        }

        await _queue.EnqueueAsync(
            new ImportJobMessage(importId, workspaceId, userId, blobPath, fileName, operationId, objectType, mappingJson, mode),
            cancellationToken).ConfigureAwait(false);

        return new ImportStartResult(ImportStartOutcome.Success, importId);
    }

    public async Task<ImportStatusResponse?> GetStatusAsync(Guid importId, Guid userId, CancellationToken cancellationToken)
    {
        var jobs = await _db.Set<ImportJobRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetImportById @ImportId, @UserId",
                new SqlParameter("@ImportId", importId),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var job = jobs.FirstOrDefault();
        if (job is null)
        {
            return null;
        }

        var rows = await _db.Set<ImportReportRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetImportRows @ImportId, @UserId",
                new SqlParameter("@ImportId", importId),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var flagged = rows
            .Select(row => new ImportFlaggedRowDto(row.RowIndex, ParseReasons(row.ReasonsJson)))
            .ToList();

        return new ImportStatusResponse(
            job.ImportId,
            job.WorkspaceId,
            job.StartedByUserId,
            DateTime.SpecifyKind(job.StartedAt, DateTimeKind.Utc),
            job.Status,
            job.TotalRows,
            job.LandedRows,
            job.CreatedRows,
            job.UpdatedRows,
            flagged);
    }

    private static IReadOnlyList<ImportReasonDto> ParseReasons(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return Array.Empty<ImportReasonDto>();
        }

        try
        {
            return JsonSerializer.Deserialize<List<ImportReasonDto>>(json, JsonOptions) ?? new List<ImportReasonDto>();
        }
        catch (JsonException)
        {
            return Array.Empty<ImportReasonDto>();
        }
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
            // original outcome the caller is already being told about.
        }
    }
}
