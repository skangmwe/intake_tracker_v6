// Crossing-map service (S35 — api-contracts §19, BS §6.2). Read (usp_GetCrossingMap — seeded + durable),
// propose (usp_ProposeCrossingMap), confirm (usp_ConfirmCrossingMap), and candidate fields
// (usp_GetCrossingCandidates). The controller's Platform-admin AccessGuard is the access boundary;
// the procs raise 50080–50087 for the propose/confirm guards, mapped here to outcomes (no exceptions
// for expected control flow — the provisioning-service precedent). Every value is a SqlParameter.

using McDermott.AiTracker.Api.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.PlatformAdmin;

public enum CrossingMapWriteOutcome
{
    Success,
    FieldNotFound,   // 50080
    Unmappable,      // 50081 — derived / platform-defined
    TypeMismatch,    // 50082
    WrongDirection,  // 50083
    AlreadyMapped,   // 50084
    BadOptionMap,    // 50085
    NotProposable,   // 50086 — confirm: missing / not in Proposed state
    FieldRetired,    // 50087 — confirm: a side was retired
}

public sealed record CrossingMapWriteResult(CrossingMapWriteOutcome Outcome, CrossingMapRowResponse? Row = null);

public interface ICrossingMapService
{
    Task<IReadOnlyList<CrossingMapRowResponse>> GetAsync(CancellationToken cancellationToken);

    Task<CrossingCandidatesResponse> GetCandidatesAsync(CancellationToken cancellationToken);

    Task<CrossingMapWriteResult> ProposeAsync(
        CrossingMapProposeRequest request, Guid actorUserId, CancellationToken cancellationToken);

    Task<CrossingMapWriteResult> ConfirmAsync(Guid crossingMapId, Guid actorUserId, CancellationToken cancellationToken);
}

public sealed class CrossingMapService : ICrossingMapService
{
    private const int FieldNotFoundError = 50080;
    private const int UnmappableError = 50081;
    private const int TypeMismatchError = 50082;
    private const int WrongDirectionError = 50083;
    private const int AlreadyMappedError = 50084;
    private const int BadOptionMapError = 50085;
    private const int NotProposableError = 50086;
    private const int FieldRetiredError = 50087;

    private readonly AppDbContext _db;

    public CrossingMapService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<CrossingMapRowResponse>> GetAsync(CancellationToken cancellationToken)
    {
        var rows = await _db.Set<CrossingMapRow>()
            .FromSqlRaw("EXEC dbo.usp_GetCrossingMap")
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows.Select(Map).ToList();
    }

    public async Task<CrossingCandidatesResponse> GetCandidatesAsync(CancellationToken cancellationToken)
    {
        var rows = await _db.Set<CrossingCandidateRow>()
            .FromSqlRaw("EXEC dbo.usp_GetCrossingCandidates")
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        static CrossingCandidateResponse ToDto(CrossingCandidateRow row) =>
            new(row.FieldDefinitionId, row.Side, row.FieldKey, row.DisplayName, row.FieldType);

        var pgFields = rows.Where(row => row.Side == "PG").Select(ToDto).ToList();
        var aiFields = rows.Where(row => row.Side == "AI").Select(ToDto).ToList();
        return new CrossingCandidatesResponse(pgFields, aiFields);
    }

    public async Task<CrossingMapWriteResult> ProposeAsync(
        CrossingMapProposeRequest request, Guid actorUserId, CancellationToken cancellationToken)
    {
        try
        {
            var rows = await _db.Set<CrossingMapRow>()
                .FromSqlRaw(
                    "EXEC dbo.usp_ProposeCrossingMap @PgFieldDefinitionId, @AiFieldDefinitionId, @OptionCorrespondenceJson, @ActorUserId",
                    new SqlParameter("@PgFieldDefinitionId", request.PgFieldDefinitionId),
                    new SqlParameter("@AiFieldDefinitionId", request.AiFieldDefinitionId),
                    new SqlParameter("@OptionCorrespondenceJson", (object?)request.OptionCorrespondenceJson ?? DBNull.Value),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()))
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);

            return new CrossingMapWriteResult(CrossingMapWriteOutcome.Success, Map(rows[0]));
        }
        catch (SqlException ex)
        {
            return new CrossingMapWriteResult(MapError(ex.Number));
        }
    }

    public async Task<CrossingMapWriteResult> ConfirmAsync(
        Guid crossingMapId, Guid actorUserId, CancellationToken cancellationToken)
    {
        try
        {
            var rows = await _db.Set<CrossingMapRow>()
                .FromSqlRaw(
                    "EXEC dbo.usp_ConfirmCrossingMap @CrossingMapId, @ActorUserId",
                    new SqlParameter("@CrossingMapId", crossingMapId),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()))
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);

            return new CrossingMapWriteResult(CrossingMapWriteOutcome.Success, Map(rows[0]));
        }
        catch (SqlException ex)
        {
            return new CrossingMapWriteResult(MapError(ex.Number));
        }
    }

    private static CrossingMapWriteOutcome MapError(int number) => number switch
    {
        FieldNotFoundError => CrossingMapWriteOutcome.FieldNotFound,
        UnmappableError => CrossingMapWriteOutcome.Unmappable,
        TypeMismatchError => CrossingMapWriteOutcome.TypeMismatch,
        WrongDirectionError => CrossingMapWriteOutcome.WrongDirection,
        AlreadyMappedError => CrossingMapWriteOutcome.AlreadyMapped,
        BadOptionMapError => CrossingMapWriteOutcome.BadOptionMap,
        NotProposableError => CrossingMapWriteOutcome.NotProposable,
        FieldRetiredError => CrossingMapWriteOutcome.FieldRetired,
        _ => throw new InvalidOperationException($"Unexpected crossing-map SQL error {number}."),
    };

    private static CrossingMapRowResponse Map(CrossingMapRow row) => new(
        row.CrossingMapId,
        row.SourceFieldKey, row.SourceDisplayName, row.SourceFieldType,
        row.TargetFieldKey, row.TargetDisplayName, row.TargetFieldType,
        row.Status, row.OptionCorrespondenceJson, row.ConfirmedByUserId,
        row.ConfirmedAt is { } confirmedAt ? DateTime.SpecifyKind(confirmedAt, DateTimeKind.Utc) : null);
}
