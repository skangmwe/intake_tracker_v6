// Import runner (Slice 16 — BS §13). The per-job worker driven by ImportProcessor off the request
// thread. It downloads the CSV blob, parses it (CsvHelper — RFC-4180 quoting/escaping handled for
// us), and for each data row: maps columns to a create request (CsvRowMapper), resolves the Requestor
// against the firm directory via SSO email (falling back to the importing admin WITH a flag — never
// silent, BS §13), and creates the Request through the shared IRequestsService (create-only — import
// never updates a live record). Each row's outcome is recorded; the job is stamped terminal at the
// end. request.created fans no notification for a brand-new record (it has no watchers yet), so "no
// per-record notifications during import" holds. A single bad row is flagged and skipped — it never
// aborts the batch. CSV values / Requestor emails are Confidential/PII — never logged; only ids and
// row indices appear in a log (api-pii-handling.md).

using System.Globalization;
using System.Text.Json;
using CsvHelper;
using CsvHelper.Configuration;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Storage;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

public interface IImportRunner
{
    Task RunAsync(ImportJobMessage message, CancellationToken cancellationToken);
}

public sealed class ImportRunner : IImportRunner
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly IBlobStreamer _blob;
    private readonly IRequestsService _requests;
    private readonly ILogger<ImportRunner> _logger;

    public ImportRunner(AppDbContext db, IBlobStreamer blob, IRequestsService requests, ILogger<ImportRunner> logger)
    {
        _db = db;
        _blob = blob;
        _requests = requests;
        _logger = logger;
    }

    public async Task RunAsync(ImportJobMessage message, CancellationToken cancellationToken)
    {
        var fallbackEmail = await ResolveFallbackEmailAsync(message.StartedByUserId, cancellationToken).ConfigureAwait(false);

        string[] headers;
        var records = new List<string?[]>();

        await using (var stream = await _blob.DownloadAsync(message.BlobPath, cancellationToken).ConfigureAwait(false))
        using (var reader = new StreamReader(stream))
        using (var csv = new CsvReader(reader, new CsvConfiguration(CultureInfo.InvariantCulture) { HasHeaderRecord = true }))
        {
            if (!await csv.ReadAsync().ConfigureAwait(false) || !csv.ReadHeader() || csv.HeaderRecord is null)
            {
                // No header row means nothing to import — a permanent failure, not a retry.
                await CompleteAsync(message.ImportId, "Failed", 0, 0, 0, cancellationToken).ConfigureAwait(false);
                return;
            }

            headers = csv.HeaderRecord;
            while (await csv.ReadAsync().ConfigureAwait(false))
            {
                cancellationToken.ThrowIfCancellationRequested();
                var values = new string?[headers.Length];
                for (var column = 0; column < headers.Length; column++)
                {
                    values[column] = csv.TryGetField<string>(column, out var field) ? field : null;
                }

                records.Add(values);
            }
        }

        // The wizard's explicit column→field mapping, or null to fall back to header-alias auto-match.
        var mapping = ParseMapping(message.MappingJson);

        var total = 0;
        var landed = 0;
        var flagged = 0;

        for (var index = 0; index < records.Count; index++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var rowIndex = index + 1;
            var (outcome, recordId, reasons) = await ProcessRowAsync(
                message, headers, records[index], mapping, fallbackEmail, rowIndex, cancellationToken).ConfigureAwait(false);

            await RecordRowAsync(message, rowIndex, outcome, recordId, reasons, cancellationToken).ConfigureAwait(false);

            total++;
            if (outcome == "Landed")
            {
                landed++;
            }

            if (reasons.Count > 0)
            {
                flagged++;
            }
        }

        var status = ImportOutcomeMapper.DecideStatus(total, flagged, parseFailed: false);
        await CompleteAsync(message.ImportId, status, total, landed, flagged, cancellationToken).ConfigureAwait(false);
    }

    private async Task<(string Outcome, string? RecordId, IReadOnlyList<ImportReasonDto> Reasons)> ProcessRowAsync(
        ImportJobMessage message, string[] headers, string?[] values,
        IReadOnlyList<ImportColumnMapping>? mapping, string fallbackEmail, int rowIndex,
        CancellationToken cancellationToken)
    {
        try
        {
            // Explicit wizard mapping when present; header-alias auto-match otherwise (backward-compat).
            var mapped = mapping is not null
                ? CsvRowMapper.MapFromMapping(mapping, values)
                : CsvRowMapper.Map(headers, values);
            var warnings = await ResolveRequestorAsync(mapped, fallbackEmail, cancellationToken).ConfigureAwait(false);

            var result = await _requests
                .CreateAsync(message.WorkspaceId, mapped.Create, message.StartedByUserId, message.OperationId, cancellationToken)
                .ConfigureAwait(false);

            return result.Outcome switch
            {
                RequestWriteOutcome.Success => ("Landed", result.Request!.Id, warnings),
                RequestWriteOutcome.ValidationFailed => ("Flagged", null, ImportOutcomeMapper.FromValidationErrors(result.Errors!)),
                _ => ("Flagged", null, ImportOutcomeMapper.GenericFailure()),
            };
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // One malformed row never aborts the batch — flag it and continue. Log the row index only
            // (no CSV content / PII).
            _logger.LogWarning("Import {ImportId} row {RowIndex} failed to process and was flagged.", message.ImportId, rowIndex);
            return ("Flagged", null, ImportOutcomeMapper.GenericFailure());
        }
    }

    /// <summary>
    /// Resolve the row's Requestor value to a firm user (SSO email). Found → keep the value; provided
    /// but unresolved → default to the importing admin AND flag it (BS §13, never silent); absent →
    /// nothing to resolve, no flag. Mutates the create request's Fields map in place.
    /// </summary>
    private async Task<IReadOnlyList<ImportReasonDto>> ResolveRequestorAsync(
        MappedRow mapped, string fallbackEmail, CancellationToken cancellationToken)
    {
        var requestor = mapped.RequestorValue;
        if (string.IsNullOrWhiteSpace(requestor))
        {
            return Array.Empty<ImportReasonDto>();
        }

        var fields = mapped.Create.Fields ??= new Dictionary<string, JsonElement>(StringComparer.Ordinal);

        var match = await _db.Users.AsNoTracking()
            .FirstOrDefaultAsync(user => user.Email == requestor && !user.IsDisabled, cancellationToken)
            .ConfigureAwait(false);

        if (match is not null)
        {
            fields[CsvRowMapper.RequestorFieldKey] = JsonSerializer.SerializeToElement(requestor, JsonOptions);
            return Array.Empty<ImportReasonDto>();
        }

        fields[CsvRowMapper.RequestorFieldKey] = JsonSerializer.SerializeToElement(fallbackEmail, JsonOptions);
        return new[]
        {
            ImportOutcomeMapper.UnresolvedRequestor(CsvRowMapper.RequestorFieldKey),
            ImportOutcomeMapper.RequestorFallback(CsvRowMapper.RequestorFieldKey),
        };
    }

    private async Task<string> ResolveFallbackEmailAsync(Guid userId, CancellationToken cancellationToken)
    {
        var admin = await _db.Users.AsNoTracking()
            .FirstOrDefaultAsync(user => user.UserId == userId, cancellationToken).ConfigureAwait(false);
        return admin?.Email ?? userId.ToString();
    }

    /// <summary>Parse the wizard's column→field mapping. Empty/absent/malformed JSON returns null so the
    /// runner falls back to header-alias auto-match rather than failing the batch.</summary>
    private static IReadOnlyList<ImportColumnMapping>? ParseMapping(string? mappingJson)
    {
        if (string.IsNullOrWhiteSpace(mappingJson))
        {
            return null;
        }

        try
        {
            var mapping = JsonSerializer.Deserialize<List<ImportColumnMapping>>(mappingJson, JsonOptions);
            return mapping is { Count: > 0 } ? mapping : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private async Task RecordRowAsync(
        ImportJobMessage message, int rowIndex, string outcome, string? recordId,
        IReadOnlyList<ImportReasonDto> reasons, CancellationToken cancellationToken)
    {
        var reasonsJson = reasons.Count == 0 ? null : JsonSerializer.Serialize(reasons, JsonOptions);
        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_RecordImportRow @ImportId, @RowIndex, @Outcome, @RecordId, @ReasonsJson, @ActorUserId",
            new[]
            {
                new SqlParameter("@ImportId", message.ImportId),
                new SqlParameter("@RowIndex", rowIndex),
                new SqlParameter("@Outcome", outcome),
                new SqlParameter("@RecordId", (object?)recordId ?? DBNull.Value),
                new SqlParameter("@ReasonsJson", (object?)reasonsJson ?? DBNull.Value),
                new SqlParameter("@ActorUserId", message.StartedByUserId),
            },
            cancellationToken).ConfigureAwait(false);
    }

    private async Task CompleteAsync(
        Guid importId, string status, int total, int landed, int flagged, CancellationToken cancellationToken)
    {
        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_CompleteImport @ImportId, @Status, @TotalRows, @LandedRows, @FlaggedRows",
            new[]
            {
                new SqlParameter("@ImportId", importId),
                new SqlParameter("@Status", status),
                new SqlParameter("@TotalRows", total),
                new SqlParameter("@LandedRows", landed),
                new SqlParameter("@FlaggedRows", flagged),
            },
            cancellationToken).ConfigureAwait(false);
    }
}
