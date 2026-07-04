// Platform-defined field schema service (S34 — api-contracts.md §19). Reads the central field
// catalog and applies a Platform admin's edit to a field's definition (name / options). Reads go
// through usp_GetPlatformFields; the edit goes through usp_UpdatePlatformField (system fields are
// immutable to everyone). Every edit applies to all workspaces at once and emits one audit event.

using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Fields;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.PlatformAdmin;

public enum PlatformFieldOutcome
{
    Success,
    NotFound,
    SystemImmutable,
}

public sealed record PlatformFieldResult(PlatformFieldOutcome Outcome, PlatformFieldDto? Field = null);

public interface IPlatformFieldService
{
    Task<IReadOnlyList<PlatformFieldDto>> GetAllAsync(CancellationToken cancellationToken);

    Task<PlatformFieldResult> UpdateAsync(
        string fieldKey, string displayName, IReadOnlyList<string>? selectOptions, Guid actorUserId, string operationId, CancellationToken cancellationToken);
}

public sealed class PlatformFieldService : IPlatformFieldService
{
    // Every platform-field edit is a firm-wide config change; the audit row is workspace-agnostic,
    // so it is stamped against the AI Solutions workspace as the platform-scope home.
    private static readonly Guid PlatformAuditWorkspaceId = new("1A150000-0000-4000-8000-000000000001");

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly IEventSpine _eventSpine;
    private readonly IClock _clock;

    public PlatformFieldService(AppDbContext db, IEventSpine eventSpine, IClock clock)
    {
        _db = db;
        _eventSpine = eventSpine;
        _clock = clock;
    }

    public async Task<IReadOnlyList<PlatformFieldDto>> GetAllAsync(CancellationToken cancellationToken)
    {
        var rows = await ReadAsync(cancellationToken).ConfigureAwait(false);
        return rows.Select(ToDto).ToList();
    }

    public async Task<PlatformFieldResult> UpdateAsync(
        string fieldKey, string displayName, IReadOnlyList<string>? selectOptions, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var rows = await ReadAsync(cancellationToken).ConfigureAwait(false);
        var current = rows.FirstOrDefault(row => string.Equals(row.FieldKey, fieldKey, StringComparison.Ordinal));
        if (current is null)
        {
            return new PlatformFieldResult(PlatformFieldOutcome.NotFound);
        }

        if (current.IsSystemImmutable)
        {
            return new PlatformFieldResult(PlatformFieldOutcome.SystemImmutable);
        }

        var selectOptionsJson = selectOptions is { Count: > 0 } ? JsonSerializer.Serialize(selectOptions, JsonOptions) : null;

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_UpdatePlatformField @FieldKey, @DisplayName, @SelectOptionsJson, @ActorUserId",
            new[]
            {
                new SqlParameter("@FieldKey", fieldKey),
                new SqlParameter("@DisplayName", displayName),
                new SqlParameter("@SelectOptionsJson", (object?)selectOptionsJson ?? DBNull.Value),
                new SqlParameter("@ActorUserId", actorUserId.ToString()),
            },
            cancellationToken).ConfigureAwait(false);

        var payload = JsonSerializer.Serialize(new { fieldKey });
        await _eventSpine.EmitAsync(
            new EventEnvelope(Guid.NewGuid(), "platform-field.updated", PlatformAuditWorkspaceId, null, actorUserId, _clock.UtcNow, payload, operationId),
            cancellationToken).ConfigureAwait(false);

        var refreshed = await ReadAsync(cancellationToken).ConfigureAwait(false);
        var saved = refreshed.First(row => string.Equals(row.FieldKey, fieldKey, StringComparison.Ordinal));
        return new PlatformFieldResult(PlatformFieldOutcome.Success, ToDto(saved));
    }

    private Task<List<PlatformFieldRow>> ReadAsync(CancellationToken cancellationToken) =>
        _db.Set<PlatformFieldRow>()
            .FromSqlRaw("EXEC dbo.usp_GetPlatformFields")
            .ToListAsync(cancellationToken);

    private static PlatformFieldDto ToDto(PlatformFieldRow row) => new(
        row.PlatformFieldId,
        row.FieldKey,
        row.DisplayName,
        row.FieldType,
        row.Category,
        row.IsSystemImmutable,
        row.HasManualWritePath,
        ParseOptions(row.SelectOptionsJson));

    private static IReadOnlyList<string>? ParseOptions(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<List<string>>(json, JsonOptions);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
