// Workspace provisioning (S38 — api-contracts §2, BS §1.1). Clones the PG/Dept template into a new
// PG workspace through usp_ProvisionWorkspace (workspace + prefix registry + initial-admin membership
// + the template's field schema, one transaction). The blank / duplicate-prefix / template-missing /
// unknown-admin guards surface as SqlException numbers mapped to service outcomes (no exceptions for
// expected control flow at the boundary — the members precedent). A successful provision emits one
// event on the NEW workspace so it lands in the firm-wide audit (S39, BS §11.1).

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Workspaces;

public enum ProvisionOutcome
{
    Success,
    BlankInput,
    DuplicatePrefix,
    TemplateMissing,
    UnknownAdmin,
}

public sealed record ProvisionResult(ProvisionOutcome Outcome, WorkspaceProvisionResponse? Workspace = null);

public interface IWorkspaceProvisioningService
{
    Task<ProvisionResult> ProvisionAsync(
        WorkspaceProvisionRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    Task<IReadOnlyList<WorkspaceListRow>> ListAsync(CancellationToken cancellationToken);
}

public sealed class WorkspaceProvisioningService : IWorkspaceProvisioningService
{
    // Guards raised by usp_ProvisionWorkspace.
    private const int BlankError = 50070;
    private const int DuplicatePrefixError = 50071;
    private const int TemplateMissingError = 50072;
    private const int UnknownAdminError = 50073;

    private readonly AppDbContext _db;
    private readonly IEventSpine _eventSpine;
    private readonly IClock _clock;

    public WorkspaceProvisioningService(AppDbContext db, IEventSpine eventSpine, IClock clock)
    {
        _db = db;
        _eventSpine = eventSpine;
        _clock = clock;
    }

    public async Task<ProvisionResult> ProvisionAsync(
        WorkspaceProvisionRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        try
        {
            var rows = await _db.Set<WorkspaceProvisionRow>()
                .FromSqlRaw(
                    "EXEC dbo.usp_ProvisionWorkspace @Name, @Prefix, @InitialAdminUserId, @InitialAdminEmail, @ActorUserId",
                    new SqlParameter("@Name", request.Name!),
                    new SqlParameter("@Prefix", request.Prefix!),
                    new SqlParameter("@InitialAdminUserId", (object?)request.InitialAdminUserId ?? DBNull.Value),
                    new SqlParameter("@InitialAdminEmail", (object?)request.InitialAdminEmail ?? DBNull.Value),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()))
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);

            var created = rows[0];
            var response = new WorkspaceProvisionResponse(created.WorkspaceId, created.Name, created.Kind, created.Prefix);

            await EmitAsync(
                created.WorkspaceId,
                new { created.WorkspaceId, created.Prefix, created.Kind },
                actorUserId,
                operationId,
                cancellationToken).ConfigureAwait(false);

            return new ProvisionResult(ProvisionOutcome.Success, response);
        }
        catch (SqlException ex) when (ex.Number == BlankError)
        {
            return new ProvisionResult(ProvisionOutcome.BlankInput);
        }
        catch (SqlException ex) when (ex.Number == DuplicatePrefixError)
        {
            return new ProvisionResult(ProvisionOutcome.DuplicatePrefix);
        }
        catch (SqlException ex) when (ex.Number == TemplateMissingError)
        {
            return new ProvisionResult(ProvisionOutcome.TemplateMissing);
        }
        catch (SqlException ex) when (ex.Number == UnknownAdminError)
        {
            return new ProvisionResult(ProvisionOutcome.UnknownAdmin);
        }
    }

    public async Task<IReadOnlyList<WorkspaceListRow>> ListAsync(CancellationToken cancellationToken)
    {
        var rows = await _db.Set<WorkspaceListReadRow>()
            .FromSqlRaw("EXEC dbo.usp_ListWorkspacesForPlatform")
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows
            .Select(row => new WorkspaceListRow(
                row.WorkspaceId, row.Name, row.Kind, row.Prefix,
                row.OwnerDisplayName, row.MemberCount, row.ProvisionedAt, row.IsArchived))
            .ToList();
    }

    private async Task EmitAsync(
        Guid workspaceId, object payloadObject, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var payload = System.Text.Json.JsonSerializer.Serialize(
            payloadObject, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web));
        var envelope = new EventEnvelope(
            Guid.NewGuid(), "workspace.provisioned", workspaceId, RecordId: null, actorUserId, _clock.UtcNow, payload, operationId);
        await _eventSpine.EmitAsync(envelope, cancellationToken).ConfigureAwait(false);
    }
}
