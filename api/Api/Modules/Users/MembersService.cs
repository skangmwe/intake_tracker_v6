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
    /// <summary>Added or level-changed against an existing platform user.</summary>
    Member,
    /// <summary>A pending invitation was created for an email with no account yet.</summary>
    Invited,
    /// <summary>More than one user matched the email — the caller must use the exact address.</summary>
    Ambiguous,
    /// <summary>That email already has a live pending invitation in this workspace.</summary>
    AlreadyInvited,
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

public enum SetSuspensionOutcome
{
    Success,
    /// <summary>Suspending a user who is the named individual on a pending sign-off — mapped to 409.</summary>
    Blocked,
}

public sealed record SetSuspensionResult(SetSuspensionOutcome Outcome);

public enum CancelInvitationOutcome
{
    Cancelled,
    /// <summary>No live invitation with that id in this workspace — mapped to 403, never 404.</summary>
    NotFound,
}

public sealed record CancelInvitationResult(CancelInvitationOutcome Outcome);

public interface IMembersService
{
    Task<MembersListDto> ListAsync(Guid workspaceId, CancellationToken cancellationToken);

    Task<MembershipUpsertResult> UpsertAsync(
        Guid workspaceId, MembershipUpsertRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    Task<DeactivateMemberResult> DeactivateAsync(
        Guid workspaceId, Guid targetUserId, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    Task<SetSuspensionResult> SetSuspensionAsync(
        Guid workspaceId, Guid targetUserId, bool suspended, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    Task<CancelInvitationResult> CancelInvitationAsync(
        Guid workspaceId, Guid invitationId, Guid actorUserId, string operationId, CancellationToken cancellationToken);
}

public sealed class MembersService : IMembersService
{
    // Guards raised by the membership procs (usp_UpsertWorkspaceMembership / usp_DeactivateMember).
    private const int AmbiguousError = 50021;
    private const int AlreadyInvitedError = 50022;
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
                // Null for a pending invitation (no sign-in yet).
                row.LastActiveAt is { } lastActive ? DateTime.SpecifyKind(lastActive, DateTimeKind.Utc) : null,
                row.Status,
                row.InvitationId))
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

            // Unknown email → a pending invitation was recorded. Emit a no-PII event (no email/UserId).
            if (string.Equals(resolved.Outcome, "Invited", StringComparison.Ordinal))
            {
                await EmitAsync(
                    workspaceId,
                    "member.invited",
                    new { resolved.Level },
                    actorUserId,
                    operationId,
                    cancellationToken).ConfigureAwait(false);

                return new MembershipUpsertResult(MembershipUpsertOutcome.Invited);
            }

            await EmitAsync(
                workspaceId,
                "membership.updated",
                new { resolved.UserId, resolved.Level, resolved.WasAdded },
                actorUserId,
                operationId,
                cancellationToken).ConfigureAwait(false);

            return new MembershipUpsertResult(MembershipUpsertOutcome.Member, resolved.UserId, resolved.WasAdded);
        }
        catch (SqlException ex) when (ex.Number == AmbiguousError)
        {
            return new MembershipUpsertResult(MembershipUpsertOutcome.Ambiguous);
        }
        catch (SqlException ex) when (ex.Number == AlreadyInvitedError)
        {
            return new MembershipUpsertResult(MembershipUpsertOutcome.AlreadyInvited);
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

    public async Task<SetSuspensionResult> SetSuspensionAsync(
        Guid workspaceId, Guid targetUserId, bool suspended, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_SetMemberSuspension @WorkspaceId, @TargetUserId, @Suspended, @ActorUserId",
                new[]
                {
                    new SqlParameter("@WorkspaceId", workspaceId),
                    new SqlParameter("@TargetUserId", targetUserId),
                    new SqlParameter("@Suspended", suspended),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()),
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == PendingSignoffError)
        {
            return new SetSuspensionResult(SetSuspensionOutcome.Blocked);
        }

        await EmitAsync(
            workspaceId,
            suspended ? "member.suspended" : "member.reactivated",
            new { UserId = targetUserId },
            actorUserId,
            operationId,
            cancellationToken).ConfigureAwait(false);

        return new SetSuspensionResult(SetSuspensionOutcome.Success);
    }

    public async Task<CancelInvitationResult> CancelInvitationAsync(
        Guid workspaceId, Guid invitationId, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<CancelInvitationRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_CancelInvitation @WorkspaceId, @InvitationId, @ActorUserId",
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@InvitationId", invitationId),
                new SqlParameter("@ActorUserId", actorUserId.ToString()))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // No live invite with that id in this workspace → 403 (never disclose existence).
        if (rows.Count == 0 || !rows[0].Cancelled)
        {
            return new CancelInvitationResult(CancelInvitationOutcome.NotFound);
        }

        await EmitAsync(
            workspaceId,
            "invitation.cancelled",
            new { InvitationId = invitationId },
            actorUserId,
            operationId,
            cancellationToken).ConfigureAwait(false);

        return new CancelInvitationResult(CancelInvitationOutcome.Cancelled);
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
