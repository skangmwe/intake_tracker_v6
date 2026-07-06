// Audit service (Slice 18 — api-contracts.md §18, module-boundaries.md §19). Owns the S33 workspace
// audit-log read: a page of dbo.AuditEntry rows (newest first) with optional date / actor / record /
// event-type filters, plus the total count for the filtered set.
//
// The read runs through raw ADO.NET on the context connection with every value parameterised
// (api-data-access.md) — usp_QueryWorkspaceAudit returns two result sets (page rows + TotalCount),
// which FromSqlRaw cannot bind (same shape as SearchService.SearchFullAsync). Access is NOT enforced
// here: the single authoritative check (caller is a WorkspaceAdmin of the workspace) is made in the
// controller (api-record-access.md); the proc is workspace-scoped as defence-in-depth. The audit
// trail is append-only — this service only reads, never writes.

using System.Data;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Requests;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Audit;

public interface IAuditService
{
    /// <summary>A page of the workspace's audit log, newest first, filtered per the request.</summary>
    Task<PaginatedResponse<AuditLogRowResponse>> QueryWorkspaceAuditAsync(
        Guid workspaceId, AuditLogQueryRequest request, CancellationToken cancellationToken);
}

public sealed class AuditService : IAuditService
{
    private readonly AppDbContext _db;

    public AuditService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<PaginatedResponse<AuditLogRowResponse>> QueryWorkspaceAuditAsync(
        Guid workspaceId, AuditLogQueryRequest request, CancellationToken cancellationToken)
    {
        var pageLocal = request.Page < 1 ? 1 : request.Page;
        var sizeLocal = request.PageSize < 1 ? 20 : request.PageSize > 100 ? 100 : request.PageSize;

        var rows = new List<AuditLogRowResponse>();
        var totalCount = 0;

        var connection = _db.Database.GetDbConnection();
        var mustClose = connection.State != ConnectionState.Open;
        if (mustClose)
        {
            await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        }

        try
        {
            using var command = connection.CreateCommand();
            command.CommandText =
                "EXEC dbo.usp_QueryWorkspaceAudit @WorkspaceId, @DateFrom, @DateTo, @ActorUserId, @RecordId, @EventType, @Page, @PageSize";
            command.Parameters.Add(new SqlParameter("@WorkspaceId", workspaceId));
            command.Parameters.Add(new SqlParameter("@DateFrom", SqlDbType.Date)
            {
                Value = request.DateFrom.HasValue
                    ? request.DateFrom.Value.ToDateTime(TimeOnly.MinValue)
                    : DBNull.Value,
            });
            command.Parameters.Add(new SqlParameter("@DateTo", SqlDbType.Date)
            {
                Value = request.DateTo.HasValue
                    ? request.DateTo.Value.ToDateTime(TimeOnly.MinValue)
                    : DBNull.Value,
            });
            command.Parameters.Add(new SqlParameter("@ActorUserId", (object?)request.ActorUserId ?? DBNull.Value));
            command.Parameters.Add(new SqlParameter("@RecordId", (object?)request.RecordId ?? DBNull.Value));
            command.Parameters.Add(new SqlParameter("@EventType", (object?)request.EventType ?? DBNull.Value));
            command.Parameters.Add(new SqlParameter("@Page", pageLocal));
            command.Parameters.Add(new SqlParameter("@PageSize", sizeLocal));

            await using var reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);

            var auditIdIndex = reader.GetOrdinal("AuditId");
            var workspaceIdIndex = reader.GetOrdinal("WorkspaceId");
            var recordIdIndex = reader.GetOrdinal("RecordId");
            var objectTypeIndex = reader.GetOrdinal("ObjectType");
            var eventTypeIndex = reader.GetOrdinal("EventType");
            var actorUserIdIndex = reader.GetOrdinal("ActorUserId");
            var actorNameIndex = reader.GetOrdinal("ActorName");
            var eventAtIndex = reader.GetOrdinal("EventAt");
            var payloadIndex = reader.GetOrdinal("EventPayload");

            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                rows.Add(new AuditLogRowResponse(
                    AuditId: reader.GetGuid(auditIdIndex),
                    WorkspaceId: reader.GetGuid(workspaceIdIndex),
                    RecordId: reader.IsDBNull(recordIdIndex) ? null : reader.GetString(recordIdIndex),
                    ObjectType: reader.IsDBNull(objectTypeIndex) ? null : reader.GetString(objectTypeIndex),
                    EventType: reader.GetString(eventTypeIndex),
                    ActorUserId: reader.IsDBNull(actorUserIdIndex) ? null : reader.GetGuid(actorUserIdIndex),
                    ActorName: reader.IsDBNull(actorNameIndex) ? null : reader.GetString(actorNameIndex),
                    EventAt: DateTime.SpecifyKind(reader.GetDateTime(eventAtIndex), DateTimeKind.Utc),
                    Payload: reader.IsDBNull(payloadIndex) ? "{}" : reader.GetString(payloadIndex)));
            }

            if (await reader.NextResultAsync(cancellationToken).ConfigureAwait(false)
                && await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                totalCount = reader.GetInt32(0);
            }
        }
        finally
        {
            if (mustClose)
            {
                await connection.CloseAsync().ConfigureAwait(false);
            }
        }

        return new PaginatedResponse<AuditLogRowResponse>(rows, totalCount, pageLocal, sizeLocal);
    }
}
