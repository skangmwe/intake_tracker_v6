// Search service (Slice 15 — api-contracts.md §14, module-boundaries.md §17). Owns the two search
// reads:
//   • SearchRecordsAsync — the top-bar records-only quick search (usp_SearchRecords, single result
//     set, capped in the proc).
//   • SearchFullAsync    — the S27 full search across records + comment bodies + attachment
//     filenames (usp_SearchFull, two result sets: page rows + total count).
//
// Access is baked into the procs — both gate on a WorkspaceMembership join and return an empty set
// for a non-member, so a search "never discloses existence" (BS §9.5 / §22.6). Both procs return
// only what the caller can see; the service adds no separate 403 (an inaccessible workspace yields an
// empty result, not an error). Both reads run through raw ADO.NET on the context's connection with
// every value parameterised (api-data-access.md); the two-result-set full read cannot bind via
// FromSqlRaw. Query text is a search term, not logged.

using System.Data;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Requests;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Search;

public interface ISearchService
{
    /// <summary>Top-bar records-only search — up to <paramref name="top"/> hits (default 6), access-respecting.</summary>
    Task<IReadOnlyList<SearchHitDto>> SearchRecordsAsync(
        Guid workspaceId, Guid userId, string? query, int top, CancellationToken cancellationToken);

    /// <summary>Full S27 search across records + comments + attachment filenames, paginated + access-respecting.</summary>
    Task<PaginatedResponse<SearchResultDto>> SearchFullAsync(
        Guid workspaceId, Guid userId, string? query, int page, int pageSize, CancellationToken cancellationToken);
}

public sealed class SearchService : ISearchService
{
    private readonly AppDbContext _db;

    public SearchService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<SearchHitDto>> SearchRecordsAsync(
        Guid workspaceId, Guid userId, string? query, int top, CancellationToken cancellationToken)
    {
        var trimmed = query?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return Array.Empty<SearchHitDto>();
        }

        var hits = new List<SearchHitDto>();

        var connection = _db.Database.GetDbConnection();
        var mustClose = connection.State != ConnectionState.Open;
        if (mustClose)
        {
            await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        }

        try
        {
            using var command = connection.CreateCommand();
            command.CommandText = "EXEC dbo.usp_SearchRecords @WorkspaceId, @UserId, @Query, @Top";
            command.Parameters.Add(new SqlParameter("@WorkspaceId", workspaceId.ToString()));
            command.Parameters.Add(new SqlParameter("@UserId", userId));
            command.Parameters.Add(new SqlParameter("@Query", trimmed));
            command.Parameters.Add(new SqlParameter("@Top", top));

            await using var reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);

            var recordIdIndex = reader.GetOrdinal("RecordId");
            var nameIndex = reader.GetOrdinal("Name");
            var stageIndex = reader.GetOrdinal("Stage");
            var originIndex = reader.GetOrdinal("Origin");

            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                hits.Add(new SearchHitDto(
                    RecordId: reader.GetString(recordIdIndex),
                    Name: reader.IsDBNull(nameIndex) ? string.Empty : reader.GetString(nameIndex),
                    Stage: reader.IsDBNull(stageIndex) ? null : reader.GetString(stageIndex),
                    Origin: reader.IsDBNull(originIndex) ? null : reader.GetString(originIndex)));
            }
        }
        finally
        {
            if (mustClose)
            {
                await connection.CloseAsync().ConfigureAwait(false);
            }
        }

        return hits;
    }

    public async Task<PaginatedResponse<SearchResultDto>> SearchFullAsync(
        Guid workspaceId, Guid userId, string? query, int page, int pageSize, CancellationToken cancellationToken)
    {
        var pageLocal = page < 1 ? 1 : page;
        var sizeLocal = pageSize < 1 ? 20 : pageSize > 100 ? 100 : pageSize;
        var trimmed = query?.Trim();

        if (string.IsNullOrEmpty(trimmed))
        {
            return new PaginatedResponse<SearchResultDto>(Array.Empty<SearchResultDto>(), 0, pageLocal, sizeLocal);
        }

        var rows = new List<SearchResultDto>();
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
            command.CommandText = "EXEC dbo.usp_SearchFull @WorkspaceId, @UserId, @Query, @Page, @PageSize";
            command.Parameters.Add(new SqlParameter("@WorkspaceId", workspaceId.ToString()));
            command.Parameters.Add(new SqlParameter("@UserId", userId));
            command.Parameters.Add(new SqlParameter("@Query", trimmed));
            command.Parameters.Add(new SqlParameter("@Page", pageLocal));
            command.Parameters.Add(new SqlParameter("@PageSize", sizeLocal));

            await using var reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);

            var recordIdIndex = reader.GetOrdinal("RecordId");
            var nameIndex = reader.GetOrdinal("Name");
            var stageIndex = reader.GetOrdinal("Stage");
            var originIndex = reader.GetOrdinal("Origin");
            var matchKindIndex = reader.GetOrdinal("MatchKind");
            var snippetIndex = reader.GetOrdinal("Snippet");

            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                rows.Add(new SearchResultDto(
                    RecordId: reader.GetString(recordIdIndex),
                    Name: reader.IsDBNull(nameIndex) ? string.Empty : reader.GetString(nameIndex),
                    Stage: reader.IsDBNull(stageIndex) ? null : reader.GetString(stageIndex),
                    Origin: reader.IsDBNull(originIndex) ? null : reader.GetString(originIndex),
                    MatchKind: reader.IsDBNull(matchKindIndex) ? string.Empty : reader.GetString(matchKindIndex),
                    Snippet: reader.IsDBNull(snippetIndex) ? string.Empty : reader.GetString(snippetIndex)));
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

        return new PaginatedResponse<SearchResultDto>(rows, totalCount, pageLocal, sizeLocal);
    }
}
