// Assembles a workspace's Lifecycle & gates config (S31) from the read procs and reconciles
// edits through usp_SaveLifecycleConfig. Reads go through stored procs (joins / live counts →
// api-data-access.md) bound to keyless projections; the whole structure saves in one proc call.
// Validation (one default, gates reference in-lifecycle stages) runs here so a bad payload is a
// clean 400, with the proc's THROWs as a backstop. Every successful change emits one event on the
// spine (audit consumer, BS §11.1). Member display names are PII — never logged.

using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Lifecycle;

public enum LifecycleSaveOutcome
{
    Success,
    Invalid,
}

public sealed record LifecycleSaveResult(
    LifecycleSaveOutcome Outcome,
    LifecycleConfigDto? Config = null,
    IReadOnlyList<string>? Errors = null);

public enum AddMemberOutcome
{
    Success,
    Unresolved,
    Ambiguous,
}

public sealed record AddMemberResult(AddMemberOutcome Outcome, ApproverTeamMemberDto? Member = null);

public interface ILifecycleService
{
    Task<LifecycleConfigDto> GetConfigAsync(Guid workspaceId, CancellationToken cancellationToken);

    /// <summary>The lightweight lifecycle list for the S3 intake picker and S31 dropdown (v2, slice 27).</summary>
    Task<IReadOnlyList<LifecycleSummaryDto>> GetSummariesAsync(Guid workspaceId, CancellationToken cancellationToken);

    Task<LifecycleSaveResult> SaveConfigAsync(
        Guid workspaceId, LifecycleConfigUpdateRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    Task<IReadOnlyList<ApproverTeamDto>> GetApproverTeamsAsync(Guid workspaceId, CancellationToken cancellationToken);

    Task<AddMemberResult> AddApproverMemberAsync(
        Guid workspaceId, string roleLabel, string person, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    Task RemoveApproverMemberAsync(
        Guid workspaceId, string roleLabel, Guid userId, Guid actorUserId, string operationId, CancellationToken cancellationToken);
}

public sealed class LifecycleService : ILifecycleService
{
    // The role-resolution guards raised by usp_AddApproverTeamMember.
    private const int NoMatchError = 50020;
    private const int AmbiguousError = 50021;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly IEventSpine _eventSpine;
    private readonly IClock _clock;

    public LifecycleService(AppDbContext db, IEventSpine eventSpine, IClock clock)
    {
        _db = db;
        _eventSpine = eventSpine;
        _clock = clock;
    }

    public async Task<LifecycleConfigDto> GetConfigAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var lifecycles = await _db.Set<LifecycleRow>()
            .FromSqlRaw("EXEC dbo.usp_GetWorkspaceLifecycles @WorkspaceId", new SqlParameter("@WorkspaceId", workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var stages = await _db.Set<StageDefinitionRow>()
            .FromSqlRaw("EXEC dbo.usp_GetWorkspaceStages @WorkspaceId", new SqlParameter("@WorkspaceId", workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var gates = await _db.Set<GateDefinitionRow>()
            .FromSqlRaw("EXEC dbo.usp_GetWorkspaceGates @WorkspaceId", new SqlParameter("@WorkspaceId", workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var slots = await _db.Set<GateSlotRow>()
            .FromSqlRaw("EXEC dbo.usp_GetWorkspaceGateSlots @WorkspaceId", new SqlParameter("@WorkspaceId", workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var roleLabels = await _db.Set<RoleLabelRow>()
            .FromSqlRaw("EXEC dbo.usp_GetRoleLabelCatalog")
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var members = await _db.Set<ApproverTeamMemberRow>()
            .FromSqlRaw("EXEC dbo.usp_GetWorkspaceApproverTeams @WorkspaceId", new SqlParameter("@WorkspaceId", workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return AssembleConfig(workspaceId, lifecycles, stages, gates, slots, roleLabels, members);
    }

    public async Task<IReadOnlyList<LifecycleSummaryDto>> GetSummariesAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var lifecycles = await _db.Set<LifecycleRow>()
            .FromSqlRaw("EXEC dbo.usp_GetWorkspaceLifecycles @WorkspaceId", new SqlParameter("@WorkspaceId", workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return MapSummaries(lifecycles);
    }

    public async Task<IReadOnlyList<ApproverTeamDto>> GetApproverTeamsAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var roleLabels = await _db.Set<RoleLabelRow>()
            .FromSqlRaw("EXEC dbo.usp_GetRoleLabelCatalog")
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var members = await _db.Set<ApproverTeamMemberRow>()
            .FromSqlRaw("EXEC dbo.usp_GetWorkspaceApproverTeams @WorkspaceId", new SqlParameter("@WorkspaceId", workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return BuildApproverTeams(roleLabels, members);
    }

    public async Task<LifecycleSaveResult> SaveConfigAsync(
        Guid workspaceId, LifecycleConfigUpdateRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var errors = ValidateConfig(request);
        if (errors.Count > 0)
        {
            return new LifecycleSaveResult(LifecycleSaveOutcome.Invalid, Errors: errors);
        }

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_SaveLifecycleConfig @WorkspaceId, @LifecyclesJson, @ActorUserId",
            new[]
            {
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@LifecyclesJson", SerializeLifecycles(request)),
                new SqlParameter("@ActorUserId", actorUserId.ToString()),
            },
            cancellationToken).ConfigureAwait(false);

        await EmitAsync(workspaceId, "lifecycle.updated", new { lifecycleCount = request.Lifecycles!.Count }, actorUserId, operationId, cancellationToken)
            .ConfigureAwait(false);

        var config = await GetConfigAsync(workspaceId, cancellationToken).ConfigureAwait(false);
        return new LifecycleSaveResult(LifecycleSaveOutcome.Success, config);
    }

    public async Task<AddMemberResult> AddApproverMemberAsync(
        Guid workspaceId, string roleLabel, string person, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        try
        {
            var rows = await _db.Set<ApproverMemberResultRow>()
                .FromSqlRaw(
                    "EXEC dbo.usp_AddApproverTeamMember @WorkspaceId, @RoleLabel, @Person, @ActorUserId",
                    new SqlParameter("@WorkspaceId", workspaceId),
                    new SqlParameter("@RoleLabel", roleLabel),
                    new SqlParameter("@Person", person),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()))
                .ToListAsync(cancellationToken).ConfigureAwait(false);

            var resolved = rows[0];
            await EmitAsync(workspaceId, "approver-team.updated", new { roleLabel }, actorUserId, operationId, cancellationToken).ConfigureAwait(false);
            return new AddMemberResult(AddMemberOutcome.Success, new ApproverTeamMemberDto(resolved.UserId, resolved.DisplayName));
        }
        catch (SqlException ex) when (ex.Number == NoMatchError)
        {
            return new AddMemberResult(AddMemberOutcome.Unresolved);
        }
        catch (SqlException ex) when (ex.Number == AmbiguousError)
        {
            return new AddMemberResult(AddMemberOutcome.Ambiguous);
        }
    }

    public async Task RemoveApproverMemberAsync(
        Guid workspaceId, string roleLabel, Guid userId, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_RemoveApproverTeamMember @WorkspaceId, @RoleLabel, @UserId, @ActorUserId",
            new[]
            {
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@RoleLabel", roleLabel),
                new SqlParameter("@UserId", userId),
                new SqlParameter("@ActorUserId", actorUserId.ToString()),
            },
            cancellationToken).ConfigureAwait(false);

        await EmitAsync(workspaceId, "approver-team.updated", new { roleLabel }, actorUserId, operationId, cancellationToken).ConfigureAwait(false);
    }

    private async Task EmitAsync(
        Guid workspaceId, string eventType, object payloadObject, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var payload = JsonSerializer.Serialize(payloadObject, JsonOptions);
        var envelope = new EventEnvelope(
            Guid.NewGuid(), eventType, workspaceId, RecordId: null, actorUserId, _clock.UtcNow, payload, operationId);
        await _eventSpine.EmitAsync(envelope, cancellationToken).ConfigureAwait(false);
    }

    // ─── Pure helpers (unit-tested without a database) ──────────────────────────

    /// <summary>
    /// Map the flat lifecycle read into the picker/dropdown summary list (v2, slice 27). Ordered by
    /// sortOrder, then name — the same order usp_GetWorkspaceLifecycles returns, made explicit here.
    /// </summary>
    public static IReadOnlyList<LifecycleSummaryDto> MapSummaries(IReadOnlyList<LifecycleRow> lifecycles) =>
        lifecycles
            .OrderBy(lifecycle => lifecycle.SortOrder)
            .ThenBy(lifecycle => lifecycle.Name, StringComparer.Ordinal)
            .Select(lifecycle => new LifecycleSummaryDto(lifecycle.LifecycleId, lifecycle.Name, lifecycle.IsDefault))
            .ToList();

    /// <summary>Serialize the update request into the JSON shape usp_SaveLifecycleConfig expects.</summary>
    public static string SerializeLifecycles(LifecycleConfigUpdateRequest request)
    {
        var payload = (request.Lifecycles ?? Array.Empty<LifecycleUpsertInput>()).Select(lifecycle => new
        {
            id = lifecycle.Id,
            name = lifecycle.Name,
            requestType = lifecycle.RequestType,
            isDefault = lifecycle.IsDefault,
            sortOrder = lifecycle.SortOrder,
            stages = (lifecycle.Stages ?? Array.Empty<StageUpsertInput>()).Select(stage => new
            {
                id = stage.Id,
                key = stage.Key,
                label = stage.Label,
                statusCategory = stage.StatusCategory,
                sortOrder = stage.SortOrder,
            }),
            gates = (lifecycle.Gates ?? Array.Empty<GateUpsertInput>()).Select(gate => new
            {
                id = gate.Id,
                name = gate.Name,
                fromStageKey = gate.FromStageKey,
                toStageKey = gate.ToStageKey,
                sortOrder = gate.SortOrder,
                slots = (gate.Slots ?? Array.Empty<GateSlotUpsertInput>()).Select(slot => new { roleLabel = slot.RoleLabel }),
            }),
        });

        return JsonSerializer.Serialize(payload, JsonOptions);
    }

    /// <summary>Structural validation the DTO annotations can't express (cross-entity shape).</summary>
    public static List<string> ValidateConfig(LifecycleConfigUpdateRequest request)
    {
        var errors = new List<string>();
        var lifecycles = request.Lifecycles ?? Array.Empty<LifecycleUpsertInput>();

        if (lifecycles.Count == 0)
        {
            errors.Add("At least one lifecycle is required.");
            return errors;
        }

        if (lifecycles.Count(lifecycle => lifecycle.IsDefault) != 1)
        {
            errors.Add("Exactly one lifecycle must be marked as the default.");
        }

        foreach (var lifecycle in lifecycles)
        {
            var stageKeys = (lifecycle.Stages ?? Array.Empty<StageUpsertInput>())
                .Select(stage => stage.Key)
                .Where(key => !string.IsNullOrWhiteSpace(key))
                .ToList();

            var duplicateKeys = stageKeys
                .GroupBy(key => key, StringComparer.OrdinalIgnoreCase)
                .Where(group => group.Count() > 1)
                .Select(group => group.Key);
            foreach (var duplicate in duplicateKeys)
            {
                errors.Add($"The '{lifecycle.Name}' lifecycle has more than one stage with the key '{duplicate}'.");
            }

            var stageKeySet = new HashSet<string>(stageKeys!, StringComparer.OrdinalIgnoreCase);
            foreach (var gate in lifecycle.Gates ?? Array.Empty<GateUpsertInput>())
            {
                if (!stageKeySet.Contains(gate.FromStageKey ?? string.Empty) || !stageKeySet.Contains(gate.ToStageKey ?? string.Empty))
                {
                    errors.Add($"Gate '{gate.Name}' references a stage that is not part of the '{lifecycle.Name}' lifecycle.");
                }
            }
        }

        return errors;
    }

    /// <summary>Group the flat proc reads into the nested S31 config graph.</summary>
    public static LifecycleConfigDto AssembleConfig(
        Guid workspaceId,
        IReadOnlyList<LifecycleRow> lifecycles,
        IReadOnlyList<StageDefinitionRow> stages,
        IReadOnlyList<GateDefinitionRow> gates,
        IReadOnlyList<GateSlotRow> slots,
        IReadOnlyList<RoleLabelRow> roleLabels,
        IReadOnlyList<ApproverTeamMemberRow> members)
    {
        var slotsByGate = slots
            .GroupBy(slot => slot.GateDefinitionId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<GateSlotDto>)group
                    .OrderBy(slot => slot.SlotIndex)
                    .Select(slot => new GateSlotDto(slot.RoleLabel, slot.EligibleCount))
                    .ToList());

        var stagesByLifecycle = stages
            .GroupBy(stage => stage.LifecycleId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<StageDefinitionDto>)group
                    .OrderBy(stage => stage.SortOrder)
                    .Select(stage => new StageDefinitionDto(stage.StageDefinitionId, stage.StageKey, stage.Label, stage.StatusCategory, stage.SortOrder))
                    .ToList());

        var gatesByLifecycle = gates
            .GroupBy(gate => gate.LifecycleId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<GateDefinitionDto>)group
                    .OrderBy(gate => gate.SortOrder)
                    .Select(gate => new GateDefinitionDto(
                        gate.GateDefinitionId,
                        gate.LifecycleId,
                        gate.Name,
                        gate.FromStageId,
                        gate.ToStageId,
                        gate.JoinKind,
                        slotsByGate.TryGetValue(gate.GateDefinitionId, out var gateSlots) ? gateSlots : Array.Empty<GateSlotDto>()))
                    .ToList());

        var lifecycleDtos = lifecycles
            .OrderBy(lifecycle => lifecycle.SortOrder)
            .Select(lifecycle => new LifecycleDto(
                lifecycle.LifecycleId,
                lifecycle.Name,
                lifecycle.RequestType,
                lifecycle.IsDefault,
                lifecycle.SortOrder,
                stagesByLifecycle.TryGetValue(lifecycle.LifecycleId, out var lifecycleStages) ? lifecycleStages : Array.Empty<StageDefinitionDto>(),
                gatesByLifecycle.TryGetValue(lifecycle.LifecycleId, out var lifecycleGates) ? lifecycleGates : Array.Empty<GateDefinitionDto>()))
            .ToList();

        var approverTeams = BuildApproverTeams(roleLabels, members);
        var labelNames = approverTeams.Select(team => team.RoleLabel).ToList();

        return new LifecycleConfigDto(workspaceId, lifecycleDtos, labelNames, approverTeams);
    }

    /// <summary>Every catalog role label, in catalog order, each with its (possibly empty) roster.</summary>
    public static IReadOnlyList<ApproverTeamDto> BuildApproverTeams(
        IReadOnlyList<RoleLabelRow> roleLabels, IReadOnlyList<ApproverTeamMemberRow> members)
    {
        var membersByRole = members
            .GroupBy(member => member.RoleLabel, StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<ApproverTeamMemberDto>)group
                    .Select(member => new ApproverTeamMemberDto(member.UserId, member.DisplayName, member.Email))
                    .ToList(),
                StringComparer.Ordinal);

        // The catalog id per label — carried on the team so the editor can rename / retire it. A
        // label with members but no catalog row (retired label) keeps its roster but has no id.
        var idByLabel = roleLabels
            .GroupBy(role => role.Label, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.First().RoleLabelId, StringComparer.Ordinal);

        var orderedLabels = roleLabels
            .OrderBy(role => role.SortOrder)
            .Select(role => role.Label)
            .ToList();

        // Surface any membership under a role label no longer in the catalog (retired label with live members).
        var extraLabels = membersByRole.Keys
            .Where(label => !orderedLabels.Contains(label, StringComparer.Ordinal))
            .OrderBy(label => label, StringComparer.Ordinal);

        return orderedLabels
            .Concat(extraLabels)
            .Select(label => new ApproverTeamDto(
                label,
                membersByRole.TryGetValue(label, out var roster) ? roster : Array.Empty<ApproverTeamMemberDto>(),
                idByLabel.TryGetValue(label, out var roleLabelId) ? roleLabelId : null))
            .ToList();
    }
}
