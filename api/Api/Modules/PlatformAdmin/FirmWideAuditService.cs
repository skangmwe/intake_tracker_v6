// Firm-wide audit read (S39 — api-contracts §19, BS §12/§4.3). Returns a page of the append-only
// dbo.AuditEntry across EVERY workspace (including Platform-admin edits to platform-defined fields),
// newest first, with optional filters — workspace / date range / actor / record / event type. Reads
// through raw ADO.NET on the context connection with every value parameterised (api-data-access.md):
// usp_QueryFirmWideAudit returns two result sets (page rows + TotalCount) that FromSqlRaw cannot bind
// (same shape as AuditService). Access is NOT enforced here — the single authoritative check (caller
// holds the Platform-admin grant) is made in the controller; S39 is invisible to workspace admins.
// The audit trail is append-only; this service only reads. DisplayName is PII — returned for the
// surface, never logged (api-pii-handling.md).

using System.Data;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Requests;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.PlatformAdmin;

public interface IFirmWideAuditService
{
    Task<PaginatedResponse<FirmWideAuditRowResponse>> QueryAsync(
        FirmWideAuditQueryRequest request, CancellationToken cancellationToken);
}

public sealed class FirmWideAuditService : IFirmWideAuditService
{
    private readonly AppDbContext _db;

    public FirmWideAuditService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<PaginatedResponse<FirmWideAuditRowResponse>> QueryAsync(
        FirmWideAuditQueryRequest request, CancellationToken cancellationToken)
    {
        var pageLocal = request.Page < 1 ? 1 : request.Page;
        var sizeLocal = request.PageSize < 1 ? 20 : request.PageSize > 100 ? 100 : request.PageSize;

        var rows = new List<FirmWideAuditRowResponse>();
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
                "EXEC dbo.usp_QueryFirmWideAudit @WorkspaceId, @DateFrom, @DateTo, @ActorUserId, @RecordId, @EventType, @Page, @PageSize";
            command.Parameters.Add(new SqlParameter("@WorkspaceId", (object?)request.WorkspaceId ?? DBNull.Value));
            command.Parameters.Add(new SqlParameter("@DateFrom", SqlDbType.Date)
            {
                Value = request.DateFrom.HasValue ? request.DateFrom.Value.ToDateTime(TimeOnly.MinValue) : DBNull.Value,
            });
            command.Parameters.Add(new SqlParameter("@DateTo", SqlDbType.Date)
            {
                Value = request.DateTo.HasValue ? request.DateTo.Value.ToDateTime(TimeOnly.MinValue) : DBNull.Value,
            });
            command.Parameters.Add(new SqlParameter("@ActorUserId", (object?)request.ActorUserId ?? DBNull.Value));
            command.Parameters.Add(new SqlParameter("@RecordId", (object?)request.RecordId ?? DBNull.Value));
            command.Parameters.Add(new SqlParameter("@EventType", (object?)request.EventType ?? DBNull.Value));
            command.Parameters.Add(new SqlParameter("@Page", pageLocal));
            command.Parameters.Add(new SqlParameter("@PageSize", sizeLocal));

            await using var reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);

            var auditIdIndex = reader.GetOrdinal("AuditId");
            var workspaceIdIndex = reader.GetOrdinal("WorkspaceId");
            var workspaceNameIndex = reader.GetOrdinal("WorkspaceName");
            var recordIdIndex = reader.GetOrdinal("RecordId");
            var objectTypeIndex = reader.GetOrdinal("ObjectType");
            var eventTypeIndex = reader.GetOrdinal("EventType");
            var actorUserIdIndex = reader.GetOrdinal("ActorUserId");
            var actorNameIndex = reader.GetOrdinal("ActorName");
            var eventAtIndex = reader.GetOrdinal("EventAt");
            var payloadIndex = reader.GetOrdinal("EventPayload");

            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                rows.Add(new FirmWideAuditRowResponse(
                    AuditId: reader.GetGuid(auditIdIndex),
                    WorkspaceId: reader.GetGuid(workspaceIdIndex),
                    WorkspaceName: reader.IsDBNull(workspaceNameIndex) ? null : reader.GetString(workspaceNameIndex),
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

        return new PaginatedResponse<FirmWideAuditRowResponse>(rows, totalCount, pageLocal, sizeLocal);
    }
}
