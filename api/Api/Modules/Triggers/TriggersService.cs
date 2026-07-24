// Trigger admin CRUD service (slice: triggers-request-authoring, Task 2.1). Reads project the trigger
// procs into DTOs; the upsert validates business rules (comparator set, cadence/interval, non-empty
// recipients + conditions, category) before calling usp_UpsertScheduledTrigger. ObjectType/Kind are fixed
// to Request/Authored for this slice. Access (WorkspaceAdmin) is enforced by the controller.

using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Triggers;

public enum TriggerUpsertOutcome
{
    Success,
    ValidationFailed,
    NotFound,
}

public sealed record TriggerUpsertResult(
    TriggerUpsertOutcome Outcome, TriggerDto? Trigger = null, IReadOnlyList<string>? Errors = null);

public enum TriggerDeleteOutcome
{
    Deleted,
    NotFound,
}

public interface ITriggersService
{
    Task<IReadOnlyList<TriggerDto>> GetWorkspaceTriggersAsync(Guid workspaceId, CancellationToken cancellationToken);

    Task<TriggerDto?> GetByIdAsync(Guid workspaceId, Guid triggerId, CancellationToken cancellationToken);

    Task<TriggerUpsertResult> UpsertAsync(
        Guid workspaceId, Guid? triggerId, TriggerUpsertRequest request, string actor, CancellationToken cancellationToken);

    Task<TriggerDeleteOutcome> DeleteAsync(Guid workspaceId, Guid triggerId, string actor, CancellationToken cancellationToken);
}

public sealed class TriggersService : ITriggersService
{
    private const string RequestObjectType = "Request";
    private const string AuthoredKind = "Authored";

    private static readonly JsonSerializerOptions JsonOptions =
        new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private readonly AppDbContext _db;

    public TriggersService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<TriggerDto>> GetWorkspaceTriggersAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<TriggerRow>()
            .FromSqlRaw("EXEC dbo.usp_GetWorkspaceTriggers @WorkspaceId", new SqlParameter("@WorkspaceId", workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return rows.Select(Map).ToList();
    }

    public async Task<TriggerDto?> GetByIdAsync(Guid workspaceId, Guid triggerId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<TriggerRow>()
            .FromSqlRaw("EXEC dbo.usp_GetScheduledTriggerById @TriggerId, @WorkspaceId",
                new SqlParameter("@TriggerId", triggerId),
                new SqlParameter("@WorkspaceId", workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return rows.Count == 0 ? null : Map(rows[0]);
    }

    public async Task<TriggerUpsertResult> UpsertAsync(
        Guid workspaceId, Guid? triggerId, TriggerUpsertRequest request, string actor, CancellationToken cancellationToken)
    {
        var errors = TriggerRequestValidator.Validate(request);
        if (errors.Count > 0)
        {
            return new TriggerUpsertResult(TriggerUpsertOutcome.ValidationFailed, Errors: errors);
        }

        // On update the trigger must already exist in this workspace.
        if (triggerId is not null && await GetByIdAsync(workspaceId, triggerId.Value, cancellationToken).ConfigureAwait(false) is null)
        {
            return new TriggerUpsertResult(TriggerUpsertOutcome.NotFound);
        }

        // Once never carries an interval; normalise before persisting.
        var repeatInterval = string.Equals(request.Cadence, TriggerRequestValidator.CadenceRepeat, StringComparison.Ordinal)
            ? request.RepeatIntervalDays
            : null;

        var recipientsJson = JsonSerializer.Serialize(request.Recipients, JsonOptions);
        var conditionsJson = JsonSerializer.Serialize(request.Conditions, JsonOptions);

        var saved = await _db.Set<TriggerIdRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_UpsertScheduledTrigger @TriggerId, @WorkspaceId, @ObjectType, @Kind, @Name, @IsEnabled, " +
                "@Cadence, @RepeatIntervalDays, @WindowDays, @NotificationCategory, @Recipients, @NotificationTitle, " +
                "@NotificationBody, @ConditionsJson, @By",
                new SqlParameter("@TriggerId", (object?)triggerId ?? DBNull.Value),
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@ObjectType", RequestObjectType),
                new SqlParameter("@Kind", AuthoredKind),
                new SqlParameter("@Name", request.Name.Trim()),
                new SqlParameter("@IsEnabled", request.IsEnabled),
                new SqlParameter("@Cadence", request.Cadence),
                new SqlParameter("@RepeatIntervalDays", (object?)repeatInterval ?? DBNull.Value),
                new SqlParameter("@WindowDays", DBNull.Value),
                new SqlParameter("@NotificationCategory", request.NotificationCategory),
                new SqlParameter("@Recipients", recipientsJson),
                new SqlParameter("@NotificationTitle", request.NotificationTitle.Trim()),
                new SqlParameter("@NotificationBody", request.NotificationBody ?? string.Empty),
                new SqlParameter("@ConditionsJson", conditionsJson),
                new SqlParameter("@By", actor))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var savedId = saved.Count > 0 ? saved[0].TriggerId : triggerId ?? Guid.Empty;
        var trigger = await GetByIdAsync(workspaceId, savedId, cancellationToken).ConfigureAwait(false);
        return new TriggerUpsertResult(TriggerUpsertOutcome.Success, trigger);
    }

    public async Task<TriggerDeleteOutcome> DeleteAsync(Guid workspaceId, Guid triggerId, string actor, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<TriggerDeleteResultRow>()
            .FromSqlRaw("EXEC dbo.usp_DeleteScheduledTrigger @TriggerId, @WorkspaceId, @By",
                new SqlParameter("@TriggerId", triggerId),
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@By", actor))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        var affected = rows.Count > 0 ? rows[0].RowsAffected : 0;
        return affected > 0 ? TriggerDeleteOutcome.Deleted : TriggerDeleteOutcome.NotFound;
    }

    private static TriggerDto Map(TriggerRow row) => new(
        row.TriggerId,
        row.ObjectType,
        row.Kind,
        row.Name,
        row.IsEnabled,
        row.Cadence,
        row.RepeatIntervalDays,
        row.WindowDays,
        row.NotificationCategory,
        JsonSerializer.Deserialize<List<string>>(row.Recipients, JsonOptions) ?? new List<string>(),
        row.NotificationTitle,
        row.NotificationBody,
        JsonSerializer.Deserialize<List<TriggerConditionDto>>(row.ConditionsJson, JsonOptions) ?? new List<TriggerConditionDto>());
}
