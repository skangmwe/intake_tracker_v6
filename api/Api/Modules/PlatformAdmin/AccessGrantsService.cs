// Access provisioning (S36 — api-contracts §19, BS §4.2/§4.3). Reads the privileged-grants directory
// through usp_ListPrivilegedGrants (PlatformAdmin holders + WorkspaceAdmin holders); grants the
// additive Platform-admin grant through usp_UpsertPlatformAdminGrant (by id or resolved email) and
// revokes it through usp_RevokePlatformAdminGrant. The email-resolution guards surface as
// SqlException numbers mapped to service outcomes (the members precedent). Every grant / revoke emits
// one event on the spine so it lands in the firm-wide audit (S39). DisplayName / Email are PII —
// returned to an entitled Platform admin only, never logged.

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.PlatformAdmin;

public enum GrantOutcome
{
    Success,
    Unresolved,
    Ambiguous,
}

public sealed record GrantResult(GrantOutcome Outcome, Guid? UserId = null, bool WasAdded = false);

public interface IAccessGrantsService
{
    Task<PrivilegedGrantsListResponse> ListAsync(CancellationToken cancellationToken);

    Task<GrantResult> GrantAsync(
        PlatformAdminGrantRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    Task RevokeAsync(Guid targetUserId, Guid actorUserId, string operationId, CancellationToken cancellationToken);
}

public sealed class AccessGrantsService : IAccessGrantsService
{
    private static readonly Guid PlatformAuditWorkspaceId = new("1A150000-0000-4000-8000-000000000001");

    private const int NoMatchError = 50020;
    private const int AmbiguousError = 50021;

    private readonly AppDbContext _db;
    private readonly IEventSpine _eventSpine;
    private readonly IClock _clock;

    public AccessGrantsService(AppDbContext db, IEventSpine eventSpine, IClock clock)
    {
        _db = db;
        _eventSpine = eventSpine;
        _clock = clock;
    }

    public async Task<PrivilegedGrantsListResponse> ListAsync(CancellationToken cancellationToken)
    {
        var rows = await _db.Set<PrivilegedGrantRow>()
            .FromSqlRaw("EXEC dbo.usp_ListPrivilegedGrants")
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var grants = rows
            .Select(row => new PrivilegedGrantResponse(
                row.GrantKind,
                row.UserId,
                row.DisplayName,
                row.Email,
                row.WorkspaceId,
                row.WorkspaceName,
                DateTime.SpecifyKind(row.GrantedAt, DateTimeKind.Utc)))
            .ToList();

        return new PrivilegedGrantsListResponse(grants);
    }

    public async Task<GrantResult> GrantAsync(
        PlatformAdminGrantRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        try
        {
            var rows = await _db.Set<PlatformAdminGrantResultRow>()
                .FromSqlRaw(
                    "EXEC dbo.usp_UpsertPlatformAdminGrant @TargetUserId, @Email, @ActorUserId",
                    new SqlParameter("@TargetUserId", (object?)request.UserId ?? DBNull.Value),
                    new SqlParameter("@Email", (object?)request.Email ?? DBNull.Value),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()))
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);

            var resolved = rows[0];
            await EmitAsync(
                "platform-admin.granted", new { resolved.UserId, resolved.WasAdded }, actorUserId, operationId, cancellationToken)
                .ConfigureAwait(false);

            return new GrantResult(GrantOutcome.Success, resolved.UserId, resolved.WasAdded);
        }
        catch (SqlException ex) when (ex.Number == NoMatchError)
        {
            return new GrantResult(GrantOutcome.Unresolved);
        }
        catch (SqlException ex) when (ex.Number == AmbiguousError)
        {
            return new GrantResult(GrantOutcome.Ambiguous);
        }
    }

    public async Task RevokeAsync(Guid targetUserId, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        // Idempotent — revoking a user with no active grant is a no-op.
        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_RevokePlatformAdminGrant @TargetUserId, @ActorUserId",
            new[]
            {
                new SqlParameter("@TargetUserId", targetUserId),
                new SqlParameter("@ActorUserId", actorUserId.ToString()),
            },
            cancellationToken).ConfigureAwait(false);

        await EmitAsync("platform-admin.revoked", new { UserId = targetUserId }, actorUserId, operationId, cancellationToken)
            .ConfigureAwait(false);
    }

    private async Task EmitAsync(
        string eventType, object payloadObject, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var payload = System.Text.Json.JsonSerializer.Serialize(
            payloadObject, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web));
        var envelope = new EventEnvelope(
            Guid.NewGuid(), eventType, PlatformAuditWorkspaceId, RecordId: null, actorUserId, _clock.UtcNow, payload, operationId);
        await _eventSpine.EmitAsync(envelope, cancellationToken).ConfigureAwait(false);
    }
}
