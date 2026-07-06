// Workspace membership admin (S29, api-contracts §2). Reads go through usp_ListWorkspaceMembers
// (a Users x WorkspaceMembership join → out of single-table EF CRUD, api-data-access.md); writes
// through usp_UpsertWorkspaceMembership / usp_DeactivateMember. The email-resolution guards and the
// §6.8 deactivation block surface as SqlException numbers that map to service outcomes (the
// approver-team precedent — no exceptions for expected control flow at the boundary). Every
// successful change emits one event on the spine (audit consumer, BS §11.1). Display names / emails
// are PII — never logged.

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Users;

public enum MembershipUpsertOutcome
{
    Success,
    Unresolved,
    Ambiguous,
}

public sealed record MembershipUpsertResult(
    MembershipUpsertOutcome Outcome,
    Guid? UserId = null,
    bool WasAdded = false);

public enum DeactivateMemberOutcome
{
    Success,
    Blocked,
}

public sealed record DeactivateMemberResult(DeactivateMemberOutcome Outcome);

public interface IMembersService
{
    Task<MembersListDto> ListAsync(Guid workspaceId, CancellationToken cancellationToken);

    Task<MembershipUpsertResult> UpsertAsync(
        Guid workspaceId, MembershipUpsertRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    Task<DeactivateMemberResult> DeactivateAsync(
        Guid workspaceId, Guid targetUserId, Guid actorUserId, string operationId, CancellationToken cancellationToken);
}

public sealed class MembersService : IMembersService
{
    // Guards raised by the membership procs (usp_UpsertWorkspaceMembership / usp_DeactivateMember).
    private const int NoMatchError = 50020;
    private const int AmbiguousError = 50021;
    private const int PendingSignoffError = 50030;

    private readonly AppDbContext _db;
    private readonly IEventSpine _eventSpine;
    private readonly IClock _clock;

    public MembersService(AppDbContext db, IEventSpine eventSpine, IClock clock)
    {
        _db = db;
        _eventSpine = eventSpine;
        _clock = clock;
    }

    public async Task<MembersListDto> ListAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<WorkspaceMemberRow>()
            .FromSqlRaw("EXEC dbo.usp_ListWorkspaceMembers @WorkspaceId", new SqlParameter("@WorkspaceId", workspaceId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var members = rows
            .Select(row => new WorkspaceMemberDto(
                row.UserId,
                row.DisplayName,
                row.Email,
                row.Level,
                row.IsDisabled,
                // Stored UTC (SYSUTCDATETIME) — stamp the kind so it serializes with a 'Z' suffix.
                DateTime.SpecifyKind(row.LastActiveAt, DateTimeKind.Utc)))
            .ToList();

        return new MembersListDto(members);
    }

    public async Task<MembershipUpsertResult> UpsertAsync(
        Guid workspaceId, MembershipUpsertRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        try
        {
            var rows = await _db.Set<MembershipUpsertResultRow>()
                .FromSqlRaw(
                    "EXEC dbo.usp_UpsertWorkspaceMembership @WorkspaceId, @TargetUserId, @Email, @Level, @ActorUserId",
                    new SqlParameter("@WorkspaceId", workspaceId),
                    new SqlParameter("@TargetUserId", (object?)request.UserId ?? DBNull.Value),
                    new SqlParameter("@Email", (object?)request.Email ?? DBNull.Value),
                    new SqlParameter("@Level", request.Level!),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()))
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);

            var resolved = rows[0];
            await EmitAsync(
                workspaceId,
                "membership.updated",
                new { resolved.UserId, resolved.Level, resolved.WasAdded },
                actorUserId,
                operationId,
                cancellationToken).ConfigureAwait(false);

            return new MembershipUpsertResult(MembershipUpsertOutcome.Success, resolved.UserId, resolved.WasAdded);
        }
        catch (SqlException ex) when (ex.Number == NoMatchError)
        {
            return new MembershipUpsertResult(MembershipUpsertOutcome.Unresolved);
        }
        catch (SqlException ex) when (ex.Number == AmbiguousError)
        {
            return new MembershipUpsertResult(MembershipUpsertOutcome.Ambiguous);
        }
    }

    public async Task<DeactivateMemberResult> DeactivateAsync(
        Guid workspaceId, Guid targetUserId, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_DeactivateMember @WorkspaceId, @TargetUserId, @ActorUserId",
                new[]
                {
                    new SqlParameter("@WorkspaceId", workspaceId),
                    new SqlParameter("@TargetUserId", targetUserId),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()),
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == PendingSignoffError)
        {
            return new DeactivateMemberResult(DeactivateMemberOutcome.Blocked);
        }

        await EmitAsync(
            workspaceId,
            "member.deactivated",
            new { UserId = targetUserId },
            actorUserId,
            operationId,
            cancellationToken).ConfigureAwait(false);

        return new DeactivateMemberResult(DeactivateMemberOutcome.Success);
    }

    private async Task EmitAsync(
        Guid workspaceId, string eventType, object payloadObject, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var payload = System.Text.Json.JsonSerializer.Serialize(payloadObject, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web));
        var envelope = new EventEnvelope(
            Guid.NewGuid(), eventType, workspaceId, RecordId: null, actorUserId, _clock.UtcNow, payload, operationId);
        await _eventSpine.EmitAsync(envelope, cancellationToken).ConfigureAwait(false);
    }
}
