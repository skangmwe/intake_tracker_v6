// Role-label catalog admin (S37 — api-contracts §19, BS §7.2). Reads through usp_GetRoleLabelCatalog
// (the existing slice-4 read); writes through usp_CreateRoleLabel / usp_RenameRoleLabel /
// usp_RetireRoleLabel. The catalog is platform-scope. Rename and retire are forward-only — past
// sign-offs and live gate slots keep their captured label, so the procs never touch
// GateApproverSlot / ApproverTeamMembership. The blank / duplicate / unknown guards surface as
// SqlException numbers mapped to service outcomes (no exceptions for expected control flow at the
// boundary — the members / approver-team precedent). Every successful change emits one event on the
// spine so it lands in the firm-wide audit (S39, BS §11.1).

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.PlatformAdmin;

public enum RoleLabelWriteOutcome
{
    Success,
    Blank,
    Duplicate,
    NotFound,
}

public sealed record RoleLabelWriteResult(RoleLabelWriteOutcome Outcome, RoleLabelResponse? Label = null);

public interface IRoleLabelsService
{
    Task<IReadOnlyList<RoleLabelResponse>> ListAsync(CancellationToken cancellationToken);

    Task<RoleLabelWriteResult> CreateAsync(string label, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    Task<RoleLabelWriteResult> RenameAsync(Guid roleLabelId, string label, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    Task RetireAsync(Guid roleLabelId, Guid actorUserId, string operationId, CancellationToken cancellationToken);
}

public sealed class RoleLabelsService : IRoleLabelsService
{
    // The AI Solutions workspace is the audit home for firm-wide config events (PlatformFieldService
    // precedent — AuditEntry.WorkspaceId is NOT NULL, so platform events anchor here).
    private static readonly Guid PlatformAuditWorkspaceId = new("1A150000-0000-4000-8000-000000000001");

    // Guards raised by the role-label procs.
    private const int BlankError = 50060;
    private const int DuplicateError = 50061;
    private const int NotFoundError = 50062;

    private readonly AppDbContext _db;
    private readonly IEventSpine _eventSpine;
    private readonly IClock _clock;

    public RoleLabelsService(AppDbContext db, IEventSpine eventSpine, IClock clock)
    {
        _db = db;
        _eventSpine = eventSpine;
        _clock = clock;
    }

    public async Task<IReadOnlyList<RoleLabelResponse>> ListAsync(CancellationToken cancellationToken)
    {
        var rows = await _db.Set<RoleLabelRow>()
            .FromSqlRaw("EXEC dbo.usp_GetRoleLabelCatalog")
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows.Select(row => new RoleLabelResponse(row.RoleLabelId, row.Label, row.SortOrder)).ToList();
    }

    public async Task<RoleLabelWriteResult> CreateAsync(
        string label, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        try
        {
            var rows = await _db.Set<RoleLabelRow>()
                .FromSqlRaw(
                    "EXEC dbo.usp_CreateRoleLabel @Label, @ActorUserId",
                    new SqlParameter("@Label", label),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()))
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);

            var created = rows[0];
            await EmitAsync("role-label.created", new { created.RoleLabelId, created.Label }, actorUserId, operationId, cancellationToken)
                .ConfigureAwait(false);

            return new RoleLabelWriteResult(
                RoleLabelWriteOutcome.Success, new RoleLabelResponse(created.RoleLabelId, created.Label, created.SortOrder));
        }
        catch (SqlException ex) when (ex.Number == BlankError)
        {
            return new RoleLabelWriteResult(RoleLabelWriteOutcome.Blank);
        }
        catch (SqlException ex) when (ex.Number == DuplicateError)
        {
            return new RoleLabelWriteResult(RoleLabelWriteOutcome.Duplicate);
        }
    }

    public async Task<RoleLabelWriteResult> RenameAsync(
        Guid roleLabelId, string label, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        try
        {
            var rows = await _db.Set<RoleLabelRow>()
                .FromSqlRaw(
                    "EXEC dbo.usp_RenameRoleLabel @RoleLabelId, @Label, @ActorUserId",
                    new SqlParameter("@RoleLabelId", roleLabelId),
                    new SqlParameter("@Label", label),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()))
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);

            var renamed = rows[0];
            await EmitAsync("role-label.renamed", new { renamed.RoleLabelId, renamed.Label }, actorUserId, operationId, cancellationToken)
                .ConfigureAwait(false);

            return new RoleLabelWriteResult(
                RoleLabelWriteOutcome.Success, new RoleLabelResponse(renamed.RoleLabelId, renamed.Label, renamed.SortOrder));
        }
        catch (SqlException ex) when (ex.Number == BlankError)
        {
            return new RoleLabelWriteResult(RoleLabelWriteOutcome.Blank);
        }
        catch (SqlException ex) when (ex.Number == DuplicateError)
        {
            return new RoleLabelWriteResult(RoleLabelWriteOutcome.Duplicate);
        }
        catch (SqlException ex) when (ex.Number == NotFoundError)
        {
            return new RoleLabelWriteResult(RoleLabelWriteOutcome.NotFound);
        }
    }

    public async Task RetireAsync(Guid roleLabelId, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        // Idempotent — retiring an unknown / already-retired label is a no-op (soft-delete).
        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_RetireRoleLabel @RoleLabelId, @ActorUserId",
            new[]
            {
                new SqlParameter("@RoleLabelId", roleLabelId),
                new SqlParameter("@ActorUserId", actorUserId.ToString()),
            },
            cancellationToken).ConfigureAwait(false);

        await EmitAsync("role-label.retired", new { RoleLabelId = roleLabelId }, actorUserId, operationId, cancellationToken)
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
