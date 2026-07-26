// Import runner (Slice 16; object-aware S28 Slice 2 — BS §13). The per-job worker driven by
// ImportProcessor off the request thread. It downloads the CSV blob, parses it (CsvHelper — RFC-4180
// quoting/escaping handled for us), reduces each row to a field-key → value map (the wizard's explicit
// column mapping, or the Request header-alias auto-match for the backward-compat no-mapping path), and
// hands the row to the target object's descriptor (IIoImporter) resolved from the registry — the single
// extension point. The descriptor owns create-from-row (create-only — import never updates a live
// record) and any object-specific resolution (e.g. Request's Requestor SSO lookup). Each row's outcome
// is recorded; the job is stamped terminal at the end. A single bad row is flagged and skipped — it
// never aborts the batch. CSV values / Requestor emails are Confidential/PII — never logged; only ids
// and row indices appear in a log (api-pii-handling.md).

using System.Globalization;
using System.Text.Json;
using CsvHelper;
using CsvHelper.Configuration;
using McDermott.AiTracker.Api.Data;
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
    private readonly IIoObjectRegistry _registry;
    private readonly ILogger<ImportRunner> _logger;

    public ImportRunner(AppDbContext db, IBlobStreamer blob, IIoObjectRegistry registry, ILogger<ImportRunner> logger)
    {
        _db = db;
        _blob = blob;
        _registry = registry;
        _logger = logger;
    }

    public async Task RunAsync(ImportJobMessage message, CancellationToken cancellationToken)
    {
        // Resolve the target object's import descriptor. The controller only enqueues importable object
        // types, but guard defensively — an unimportable/unknown type is a permanent failure, not a retry.
        var descriptor = await _registry
            .FindForWorkspaceAsync(message.WorkspaceId, message.ObjectType, message.StartedByUserId, cancellationToken)
            .ConfigureAwait(false);
        if (descriptor is not IIoImporter importer)
        {
            await CompleteAsync(message.ImportId, "Failed", 0, 0, 0, 0, 0, cancellationToken).ConfigureAwait(false);
            return;
        }

        var actorEmail = await ResolveActorEmailAsync(message.StartedByUserId, cancellationToken).ConfigureAwait(false);
        var context = new ImportRowContext(message.WorkspaceId, message.StartedByUserId, actorEmail, message.OperationId, message.Mode);

        string[] headers;
        var records = new List<string?[]>();

        await using (var stream = await _blob.DownloadAsync(message.BlobPath, cancellationToken).ConfigureAwait(false))
        using (var reader = new StreamReader(stream))
        using (var csv = new CsvReader(reader, new CsvConfiguration(CultureInfo.InvariantCulture) { HasHeaderRecord = true }))
        {
            if (!await csv.ReadAsync().ConfigureAwait(false) || !csv.ReadHeader() || csv.HeaderRecord is null)
            {
                // No header row means nothing to import — a permanent failure, not a retry.
                await CompleteAsync(message.ImportId, "Failed", 0, 0, 0, 0, 0, cancellationToken).ConfigureAwait(false);
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
        var created = 0;
        var updated = 0;

        for (var index = 0; index < records.Count; index++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var rowIndex = index + 1;
            var (outcome, recordId, reasons, action) = await ProcessRowAsync(
                importer, context, headers, records[index], mapping, message.ImportId, rowIndex, cancellationToken)
                .ConfigureAwait(false);

            await RecordRowAsync(message, rowIndex, outcome, recordId, reasons, cancellationToken).ConfigureAwait(false);

            total++;
            if (outcome == ImportRowResult.Landed)
            {
                landed++;
                if (action == ImportAction.Updated)
                {
                    updated++;
                }
                else
                {
                    created++;
                }
            }

            if (reasons.Count > 0)
            {
                flagged++;
            }
        }

        var status = ImportOutcomeMapper.DecideStatus(total, flagged, parseFailed: false);
        await CompleteAsync(message.ImportId, status, total, landed, flagged, created, updated, cancellationToken).ConfigureAwait(false);
    }

    private async Task<(string Outcome, string? RecordId, IReadOnlyList<ImportReasonDto> Reasons, ImportAction Action)> ProcessRowAsync(
        IIoImporter importer, ImportRowContext context, string[] headers, string?[] values,
        IReadOnlyList<ImportColumnMapping>? mapping, Guid importId, int rowIndex, CancellationToken cancellationToken)
    {
        try
        {
            // Explicit wizard mapping when present; Request header-alias auto-match otherwise (backward-compat).
            var fieldValues = mapping is not null
                ? CsvRowMapper.MapValues(mapping, values)
                : CsvRowMapper.AutoMatchValues(headers, values);

            var result = await importer.ImportRowAsync(context, fieldValues, cancellationToken).ConfigureAwait(false);
            return (result.Outcome, result.RecordId, result.Reasons, result.Action);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // One malformed row never aborts the batch — flag it and continue. Log the row index only
            // (no CSV content / PII).
            _logger.LogWarning("Import {ImportId} row {RowIndex} failed to process and was flagged.", importId, rowIndex);
            return (ImportRowResult.Flagged, null, ImportOutcomeMapper.GenericFailure(), ImportAction.None);
        }
    }

    /// <summary>Resolve the importing user's directory email — used by a descriptor as its fallback for
    /// an unresolved row value (e.g. Request's Requestor). Resolved once per job, never per row.</summary>
    private async Task<string> ResolveActorEmailAsync(Guid userId, CancellationToken cancellationToken)
    {
        var actor = await _db.Users.AsNoTracking()
            .FirstOrDefaultAsync(user => user.UserId == userId, cancellationToken).ConfigureAwait(false);
        return actor?.Email ?? userId.ToString();
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
        Guid importId, string status, int total, int landed, int flagged, int created, int updated,
        CancellationToken cancellationToken)
    {
        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_CompleteImport @ImportId, @Status, @TotalRows, @LandedRows, @FlaggedRows, @CreatedRows, @UpdatedRows",
            new[]
            {
                new SqlParameter("@ImportId", importId),
                new SqlParameter("@Status", status),
                new SqlParameter("@TotalRows", total),
                new SqlParameter("@LandedRows", landed),
                new SqlParameter("@FlaggedRows", flagged),
                new SqlParameter("@CreatedRows", created),
                new SqlParameter("@UpdatedRows", updated),
            },
            cancellationToken).ConfigureAwait(false);
    }
}
