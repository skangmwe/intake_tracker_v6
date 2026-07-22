// Relationships service (Slice 25 — v2-reconciliation.md §API deltas Relationships).
// Owns Relationship definitions (workspace-owned) and their RecordLink instances. Reads
// and writes go through stored procedures (api-data-access.md). Access-gating is done at
// the controller layer via IAccessGuard — WorkspaceAdmin for definition mutations, Viewer+
// for definition reads, Member+ for link mutations, Viewer+ for link reads. The service
// does not double-check access; it trusts the controller has already gated the call.
//
// Auto-provisioning of the paired Link-to-record FieldDefinition rows lives in
// usp_UpsertRelationship (single transaction with the Relationship insert). The service
// simply calls the proc and returns the created/updated DTO by re-reading.

using System.Data;
using McDermott.AiTracker.Api.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Relationships;

public enum RelationshipMutationOutcome
{
    Success,
    NotFound,
    InvalidState,           // 400 — cardinality-immutable violation, system-edit block.
    RetireBlockedByLinks,   // 409 — force=false with live links; caller retries with force=true.
}

public sealed record RelationshipMutationResult(
    RelationshipMutationOutcome Outcome,
    RelationshipDto? Relationship,
    int? LinkCount,
    string? Detail);

public sealed record RecordLinkMutationResult(
    RelationshipMutationOutcome Outcome,
    RelationshipLinkDto? Link,
    string? Detail);

/// <summary>Result of RetireAsync — carries the Outcome discriminator so the controller can branch
/// on 404 (NotFound) vs 409 (InvalidState — system-block, or link-count blocked without force) vs 200.
/// When Outcome=Success, Response is set; otherwise Detail explains the failure.</summary>
public sealed record RelationshipRetireResult(
    RelationshipMutationOutcome Outcome,
    RelationshipRetireResponse? Response,
    string? Detail);

public interface IRelationshipsService
{
    Task<IReadOnlyList<RelationshipDto>> ListAsync(Guid workspaceId, CancellationToken cancellationToken);
    Task<IReadOnlyList<RelationshipDto>> ListPlatformSystemAsync(CancellationToken cancellationToken);
    Task<RelationshipDto?> GetByIdAsync(Guid relationshipId, Guid workspaceId, CancellationToken cancellationToken);
    Task<RelationshipMutationResult> CreateAsync(
        Guid workspaceId, RelationshipCreateRequest request, Guid actorUserId, CancellationToken cancellationToken);
    Task<RelationshipMutationResult> UpdateAsync(
        Guid relationshipId, Guid workspaceId, RelationshipPatchRequest request, Guid actorUserId, CancellationToken cancellationToken);
    Task<RelationshipRetireResult> RetireAsync(
        Guid relationshipId, Guid workspaceId, bool force, Guid actorUserId, CancellationToken cancellationToken);
    Task<RelationshipMutationResult> RestoreAsync(
        Guid relationshipId, Guid workspaceId, Guid actorUserId, CancellationToken cancellationToken);

    Task<IReadOnlyList<RelationshipLinkDto>> ListRecordLinksAsync(
        Guid workspaceId, string recordId, Guid? relationshipId, CancellationToken cancellationToken);
    Task<RecordLinkMutationResult> CreateRecordLinkAsync(
        Guid workspaceId, string fromRecordId, Guid relationshipId, string toRecordId, Guid actorUserId, CancellationToken cancellationToken);
    Task<RecordLinkMutationResult> DeleteRecordLinkAsync(
        Guid recordLinkId, Guid workspaceId, string recordId, Guid actorUserId, CancellationToken cancellationToken);
}

public sealed class RelationshipsService : IRelationshipsService
{
    // Error numbers from usp_Upsert/Retire/RestoreRelationship (see the proc headers).
    private const int ErrNotFound       = 50060;
    private const int ErrImmutable      = 50061;
    private const int ErrSystem         = 50062;
    private const int ErrRetired        = 50063;
    // v2 review F-3 (A01 IDOR): record does not exist in the workspace (usp_UpsertRecordLink).
    private const int ErrRecordNotInWs  = 50067;
    // v2 review F-2 (A01 path-scoping bypass): link's endpoints don't match {recordId} (usp_DeleteRecordLink).
    private const int ErrLinkNotOnRecord = 50068;

    private readonly AppDbContext _db;

    public RelationshipsService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<RelationshipDto>> ListAsync(
        Guid workspaceId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<RelationshipRow>()
            .FromSqlRaw("EXEC dbo.usp_ListRelationships @WorkspaceId",
                new SqlParameter("@WorkspaceId", workspaceId))
            .AsNoTracking()
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows.Select(Map).ToList();
    }

    public async Task<IReadOnlyList<RelationshipDto>> ListPlatformSystemAsync(
        CancellationToken cancellationToken)
    {
        // The canonical system-seeded relationships every workspace inherits, de-duplicated across
        // workspaces to one row per shape (S34 Relationships tab). Read-only reference — no workspace
        // scope. Access is gated at the controller on the Platform-admin grant.
        var rows = await _db.Set<RelationshipRow>()
            .FromSqlRaw("EXEC dbo.usp_GetPlatformRelationships")
            .AsNoTracking()
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows.Select(Map).ToList();
    }

    public async Task<RelationshipDto?> GetByIdAsync(
        Guid relationshipId, Guid workspaceId, CancellationToken cancellationToken)
    {
        var row = await _db.Set<RelationshipRow>()
            .FromSqlRaw("EXEC dbo.usp_GetRelationshipById @RelationshipId, @WorkspaceId",
                new SqlParameter("@RelationshipId", relationshipId),
                new SqlParameter("@WorkspaceId", workspaceId))
            .AsNoTracking()
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return row.FirstOrDefault() is { } r ? Map(r) : null;
    }

    public async Task<RelationshipMutationResult> CreateAsync(
        Guid workspaceId, RelationshipCreateRequest request, Guid actorUserId, CancellationToken cancellationToken) =>
        await UpsertAsync(null, workspaceId, request.Name, request.FromObjectType, request.ToObjectType,
            request.Cardinality, request.FromSideLabel, request.ToSideLabel,
            request.ShowOnFromAsTab ?? false, request.TabLabel, request.SortOrder ?? 0,
            actorUserId, cancellationToken).ConfigureAwait(false);

    public async Task<RelationshipMutationResult> UpdateAsync(
        Guid relationshipId, Guid workspaceId, RelationshipPatchRequest request,
        Guid actorUserId, CancellationToken cancellationToken)
    {
        // For a patch, we must first load the existing row (cardinality/from/to are
        // immutable — we resend the existing values to the proc so the caller can send
        // sparse updates without knowing them).
        var existing = await GetByIdAsync(relationshipId, workspaceId, cancellationToken).ConfigureAwait(false);
        if (existing is null)
        {
            return new RelationshipMutationResult(
                RelationshipMutationOutcome.NotFound, null, null, "Relationship not found.");
        }

        return await UpsertAsync(
            relationshipId, workspaceId,
            request.Name ?? existing.Name,
            existing.FromObjectType, existing.ToObjectType, existing.Cardinality,
            request.FromSideLabel ?? existing.FromSideLabel,
            request.ToSideLabel ?? existing.ToSideLabel,
            request.ShowOnFromAsTab ?? existing.ShowOnFromAsTab,
            request.TabLabel ?? existing.TabLabel,
            request.SortOrder ?? existing.SortOrder,
            actorUserId, cancellationToken).ConfigureAwait(false);
    }

    private async Task<RelationshipMutationResult> UpsertAsync(
        Guid? relationshipId, Guid workspaceId,
        string name, string fromObjectType, string toObjectType, string cardinality,
        string fromSideLabel, string toSideLabel,
        bool showOnFromAsTab, string? tabLabel, int sortOrder,
        Guid actorUserId, CancellationToken cancellationToken)
    {
        var newIdParam = new SqlParameter("@NewRelationshipId", SqlDbType.UniqueIdentifier)
        {
            Direction = ParameterDirection.Output,
        };

        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                @"EXEC dbo.usp_UpsertRelationship
                    @RelationshipId, @WorkspaceId, @Name, @FromObjectType, @ToObjectType, @Cardinality,
                    @FromSideLabel, @ToSideLabel, @ShowOnFromAsTab, @TabLabel, @SortOrder,
                    @ActorUserId, @NewRelationshipId OUTPUT",
                new object[]
                {
                    new SqlParameter("@RelationshipId", (object?)relationshipId ?? DBNull.Value),
                    new SqlParameter("@WorkspaceId", workspaceId),
                    new SqlParameter("@Name", name),
                    new SqlParameter("@FromObjectType", fromObjectType),
                    new SqlParameter("@ToObjectType", toObjectType),
                    new SqlParameter("@Cardinality", cardinality),
                    new SqlParameter("@FromSideLabel", fromSideLabel),
                    new SqlParameter("@ToSideLabel", toSideLabel),
                    new SqlParameter("@ShowOnFromAsTab", showOnFromAsTab),
                    new SqlParameter("@TabLabel", (object?)tabLabel ?? DBNull.Value),
                    new SqlParameter("@SortOrder", sortOrder),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()),
                    newIdParam,
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == ErrNotFound)
        {
            return new RelationshipMutationResult(
                RelationshipMutationOutcome.NotFound, null, null, ex.Message);
        }
        catch (SqlException ex) when (ex.Number is ErrImmutable or ErrSystem)
        {
            return new RelationshipMutationResult(
                RelationshipMutationOutcome.InvalidState, null, null, ex.Message);
        }

        var newId = (Guid)newIdParam.Value!;
        var created = await GetByIdAsync(newId, workspaceId, cancellationToken).ConfigureAwait(false);
        return new RelationshipMutationResult(
            RelationshipMutationOutcome.Success, created, null, null);
    }

    public async Task<RelationshipRetireResult> RetireAsync(
        Guid relationshipId, Guid workspaceId, bool force,
        Guid actorUserId, CancellationToken cancellationToken)
    {
        var countParam = new SqlParameter("@LinkCount", SqlDbType.Int)
        {
            Direction = ParameterDirection.Output,
        };

        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_RetireRelationship @RelationshipId, @WorkspaceId, @Force, @ActorUserId, @LinkCount OUTPUT",
                new object[]
                {
                    new SqlParameter("@RelationshipId", relationshipId),
                    new SqlParameter("@WorkspaceId", workspaceId),
                    new SqlParameter("@Force", force),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()),
                    countParam,
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == ErrNotFound)
        {
            // Distinct outcomes so the controller returns 404 for missing, not a silent 200.
            return new RelationshipRetireResult(RelationshipMutationOutcome.NotFound, null, ex.Message);
        }
        catch (SqlException ex) when (ex.Number == ErrSystem)
        {
            // System-block → 409 InvalidState with the proc's plain-language detail.
            return new RelationshipRetireResult(RelationshipMutationOutcome.InvalidState, null, ex.Message);
        }

        var linkCount = countParam.Value is int c ? c : 0;
        // If force=false and there were live links, the proc returned without retiring.
        // Otherwise the row is retired now.
        var retired = force || linkCount == 0;
        return new RelationshipRetireResult(
            RelationshipMutationOutcome.Success,
            new RelationshipRetireResponse(relationshipId, linkCount, retired),
            null);
    }

    public async Task<RelationshipMutationResult> RestoreAsync(
        Guid relationshipId, Guid workspaceId, Guid actorUserId, CancellationToken cancellationToken)
    {
        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_RestoreRelationship @RelationshipId, @WorkspaceId, @ActorUserId",
                new object[]
                {
                    new SqlParameter("@RelationshipId", relationshipId),
                    new SqlParameter("@WorkspaceId", workspaceId),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()),
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == ErrNotFound)
        {
            return new RelationshipMutationResult(RelationshipMutationOutcome.NotFound, null, null, ex.Message);
        }
        catch (SqlException ex) when (ex.Number == ErrSystem)
        {
            return new RelationshipMutationResult(RelationshipMutationOutcome.InvalidState, null, null, ex.Message);
        }

        var restored = await GetByIdAsync(relationshipId, workspaceId, cancellationToken).ConfigureAwait(false);
        return new RelationshipMutationResult(RelationshipMutationOutcome.Success, restored, null, null);
    }

    public async Task<IReadOnlyList<RelationshipLinkDto>> ListRecordLinksAsync(
        Guid workspaceId, string recordId, Guid? relationshipId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<RecordLinkRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_ListRecordLinks @WorkspaceId, @RecordId, @RelationshipId",
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@RelationshipId", (object?)relationshipId ?? DBNull.Value))
            .AsNoTracking()
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows.Select(row => new RelationshipLinkDto(
            row.Id, row.RelationshipId, row.FromRecordId, row.ToRecordId,
            row.ToRecordDisplayName, row.ToRecordStage, row.Direction,
            row.CreatedAt, row.CreatedBy)).ToList();
    }

    public async Task<RecordLinkMutationResult> CreateRecordLinkAsync(
        Guid workspaceId, string fromRecordId, Guid relationshipId, string toRecordId,
        Guid actorUserId, CancellationToken cancellationToken)
    {
        var idParam = new SqlParameter("@RecordLinkId", SqlDbType.UniqueIdentifier)
        {
            Direction = ParameterDirection.Output,
        };

        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_UpsertRecordLink @RelationshipId, @WorkspaceId, @FromRecordId, @ToRecordId, @ActorUserId, @RecordLinkId OUTPUT",
                new object[]
                {
                    new SqlParameter("@RelationshipId", relationshipId),
                    new SqlParameter("@WorkspaceId", workspaceId),
                    new SqlParameter("@FromRecordId", fromRecordId),
                    new SqlParameter("@ToRecordId", toRecordId),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()),
                    idParam,
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number is ErrNotFound or ErrImmutable or ErrRetired or ErrRecordNotInWs)
        {
            // ErrNotFound → 404 (relationship missing / wrong workspace).
            // ErrImmutable → 409 (OneToOne violation).
            // ErrRetired → 409 (retired-relationship blocks new link).
            // ErrRecordNotInWs → 404 (a supplied RecordId isn't in the workspace — v2 review F-3).
            var outcome = ex.Number is ErrNotFound or ErrRecordNotInWs
                ? RelationshipMutationOutcome.NotFound
                : RelationshipMutationOutcome.InvalidState;
            return new RecordLinkMutationResult(outcome, null, ex.Message);
        }

        var linkId = (Guid)idParam.Value!;
        var links = await ListRecordLinksAsync(workspaceId, fromRecordId, relationshipId, cancellationToken)
            .ConfigureAwait(false);
        var created = links.FirstOrDefault(l => l.Id == linkId);
        return new RecordLinkMutationResult(RelationshipMutationOutcome.Success, created, null);
    }

    public async Task<RecordLinkMutationResult> DeleteRecordLinkAsync(
        Guid recordLinkId, Guid workspaceId, string recordId,
        Guid actorUserId, CancellationToken cancellationToken)
    {
        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_DeleteRecordLink @RecordLinkId, @WorkspaceId, @RecordId, @ActorUserId",
                new object[]
                {
                    new SqlParameter("@RecordLinkId", recordLinkId),
                    new SqlParameter("@WorkspaceId", workspaceId),
                    new SqlParameter("@RecordId", recordId),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()),
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == ErrLinkNotOnRecord)
        {
            // v2 review F-2: the link exists but its endpoints don't match {recordId} on the route.
            return new RecordLinkMutationResult(RelationshipMutationOutcome.NotFound, null, ex.Message);
        }

        return new RecordLinkMutationResult(RelationshipMutationOutcome.Success, null, null);
    }

    private static RelationshipDto Map(RelationshipRow row) => new(
        row.RelationshipId, row.WorkspaceId, row.Name,
        row.FromObjectType, row.ToObjectType, row.Cardinality,
        row.FromSideLabel, row.ToSideLabel,
        row.ShowOnFromAsTab, row.TabLabel, row.SortOrder,
        row.IsRetired, row.IsSystem,
        row.CreatedAt, row.UpdatedAt, row.CreatedBy, row.UpdatedBy);
}
