// Feature Catalog service (Slice 14 — api-contracts.md §11). Owns create / detail / list / patch /
// publish / deprecate and the Add-to-catalog draft prefill. Every mutation goes through a stored
// procedure with each dynamic value bound as a SqlParameter (never string-built → api-data-access.md).
// Features are AI-Solutions-workspace-only, resolved server-side by Kind. Record-scoped reads bake
// membership into the proc join (usp_GetFeatureByIdForUser) — an inaccessible or non-existent feature
// is denied uniformly (403, never 404 — BS §22.6). Each successful change emits exactly one event on
// the spine; payloads carry ids/enums only, never field values or free text (api-pii-handling.md).

using System.Data;
using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Modules.TypedLinks;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Features;

/// <summary>Outcome of a feature create/patch/maturity write.</summary>
public enum FeatureWriteOutcome
{
    Success,
    /// <summary>The caller is not a Member+ of the AI Solutions workspace (403).</summary>
    Denied,
    /// <summary>The feature does not exist / is not visible to the caller (403, never disclose — BS §22.6).</summary>
    NotFound,
    /// <summary>Stale ETag on a PATCH — 409.</summary>
    Stale,
    /// <summary>No AI Solutions workspace is provisioned — misconfiguration (500-class).</summary>
    NoHubWorkspace,
}

/// <summary>Outcome of an Add-to-catalog draft prefill.</summary>
public enum AddToCatalogOutcome
{
    Success,
    /// <summary>The source Request is not visible to the caller (403, never disclose).</summary>
    DeniedSource,
    /// <summary>The caller is not a Member+ of the AI Solutions workspace (403).</summary>
    DeniedTarget,
    NoHubWorkspace,
}

public sealed record FeatureWriteResult(FeatureWriteOutcome Outcome, FeatureDto? Feature = null);

public sealed record AddToCatalogServiceResult(AddToCatalogOutcome Outcome, Guid? DraftId = null);

public interface IFeaturesService
{
    Task<FeatureWriteResult> CreateAsync(
        FeatureCreateRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    /// <summary>The Feature Catalog list (S9). Null when the caller is not an AI-workspace member (403).</summary>
    Task<PaginatedResponse<FeatureListRowDto>?> QueryAsync(Guid userId, PaginatedQuery query, CancellationToken cancellationToken);

    Task<FeatureDto?> GetByIdAsync(string recordId, Guid userId, CancellationToken cancellationToken);

    Task<FeatureWriteResult> PatchAsync(
        string recordId, FeaturePatchRequest request, string? ifMatch, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    /// <summary>Publish (Published) or deprecate (Deprecated) — an ordinary member edit, no gate (BS §18.5).</summary>
    Task<FeatureWriteResult> SetMaturityAsync(
        string recordId, string maturity, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    Task<AddToCatalogServiceResult> AddToCatalogAsync(
        string sourceRecordId, Guid actorUserId, CancellationToken cancellationToken);
}

public sealed class FeaturesService : IFeaturesService
{
    private const int StaleRecordError = 50040;   // usp_PatchFeature — If-Match mismatch → 409.
    private const int NotFoundError = 50043;      // feature row not found → 403 / not-found.

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    /// <summary>Request field keys carried into a Feature draft by same-field-identity (BS §5 / §237).</summary>
    private static readonly IReadOnlyList<string> CatalogPrefillKeys = new[]
    {
        "techStack", "solutionPattern", "repoUrl",
    };

    private readonly AppDbContext _db;
    private readonly IAccessGuard _accessGuard;
    private readonly IEventSpine _eventSpine;
    private readonly IClock _clock;
    private readonly ITypedLinksService _typedLinks;
    private readonly IRequestsService _requests;
    private readonly IDraftsService _drafts;

    public FeaturesService(
        AppDbContext db, IAccessGuard accessGuard, IEventSpine eventSpine, IClock clock,
        ITypedLinksService typedLinks, IRequestsService requests, IDraftsService drafts)
    {
        _db = db;
        _accessGuard = accessGuard;
        _eventSpine = eventSpine;
        _clock = clock;
        _typedLinks = typedLinks;
        _requests = requests;
        _drafts = drafts;
    }

    public async Task<FeatureWriteResult> CreateAsync(
        FeatureCreateRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var hubId = await ResolveHubWorkspaceIdAsync(cancellationToken).ConfigureAwait(false);
        if (hubId is not { } workspaceId)
        {
            return new FeatureWriteResult(FeatureWriteOutcome.NoHubWorkspace);
        }

        if (!await _accessGuard.HasWorkspaceLevelAsync(actorUserId, workspaceId, WorkspaceLevel.Member, cancellationToken).ConfigureAwait(false))
        {
            return new FeatureWriteResult(FeatureWriteOutcome.Denied);
        }

        var fields = BuildFieldMap(request);
        var recordIdParameter = new SqlParameter("@RecordId", SqlDbType.NVarChar, 20)
        {
            Direction = ParameterDirection.Output,
        };

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_CreateFeature @WorkspaceId, @Name, @FieldValuesJson, @ActorUserId, @RecordId OUTPUT, @QueuedLinksJson",
            new[]
            {
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@Name", request.Name!),
                new SqlParameter("@FieldValuesJson", JsonSerializer.Serialize(fields, JsonOptions)),
                new SqlParameter("@ActorUserId", actorUserId.ToString()),
                recordIdParameter,
                new SqlParameter("@QueuedLinksJson", (object?)BuildQueuedLinksJson(request.QueuedLinks) ?? DBNull.Value),
            },
            cancellationToken).ConfigureAwait(false);

        var recordId = (string)recordIdParameter.Value!;
        await EmitAsync("feature.created", workspaceId, recordId, actorUserId, new { }, operationId, cancellationToken).ConfigureAwait(false);

        var dto = await GetByIdAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        return new FeatureWriteResult(FeatureWriteOutcome.Success, dto);
    }

    public async Task<FeatureDto?> GetByIdAsync(string recordId, Guid userId, CancellationToken cancellationToken)
    {
        var row = await ReadRowAsync(recordId, userId, cancellationToken).ConfigureAwait(false);
        if (row is null)
        {
            return null;
        }

        var sourcedFrom = await ReadSourcedFromAsync(recordId, userId, cancellationToken).ConfigureAwait(false);
        return MapRow(row, sourcedFrom);
    }

    public async Task<FeatureWriteResult> PatchAsync(
        string recordId, FeaturePatchRequest request, string? ifMatch, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var row = await ReadRowAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (row is null)
        {
            return new FeatureWriteResult(FeatureWriteOutcome.NotFound);
        }

        if (!await _accessGuard.HasWorkspaceLevelAsync(actorUserId, row.WorkspaceId, WorkspaceLevel.Member, cancellationToken).ConfigureAwait(false))
        {
            return new FeatureWriteResult(FeatureWriteOutcome.Denied);
        }

        if (!TryDecodeRowVer(ifMatch, out var rowVer))
        {
            return new FeatureWriteResult(FeatureWriteOutcome.Stale);
        }

        var mergedFields = MergeFields(ParseFields(row.FieldValues), request.Fields);
        var name = request.Name ?? row.Name;

        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_PatchFeature @RecordId, @WorkspaceId, @Name, @FieldValuesJson, @IfMatchRowVer, @ActorUserId",
                new[]
                {
                    new SqlParameter("@RecordId", recordId),
                    new SqlParameter("@WorkspaceId", row.WorkspaceId),
                    new SqlParameter("@Name", name),
                    new SqlParameter("@FieldValuesJson", JsonSerializer.Serialize(mergedFields, JsonOptions)),
                    new SqlParameter("@IfMatchRowVer", SqlDbType.VarBinary, 8) { Value = rowVer },
                    new SqlParameter("@ActorUserId", actorUserId.ToString()),
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == StaleRecordError)
        {
            return new FeatureWriteResult(FeatureWriteOutcome.Stale);
        }
        catch (SqlException ex) when (ex.Number == NotFoundError)
        {
            return new FeatureWriteResult(FeatureWriteOutcome.NotFound);
        }

        await EmitAsync("feature.updated", row.WorkspaceId, recordId, actorUserId, new { }, operationId, cancellationToken).ConfigureAwait(false);
        var dto = await GetByIdAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        return new FeatureWriteResult(FeatureWriteOutcome.Success, dto);
    }

    public async Task<FeatureWriteResult> SetMaturityAsync(
        string recordId, string maturity, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var row = await ReadRowAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (row is null)
        {
            return new FeatureWriteResult(FeatureWriteOutcome.NotFound);
        }

        if (!await _accessGuard.HasWorkspaceLevelAsync(actorUserId, row.WorkspaceId, WorkspaceLevel.Member, cancellationToken).ConfigureAwait(false))
        {
            return new FeatureWriteResult(FeatureWriteOutcome.Denied);
        }

        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_SetFeatureMaturity @RecordId, @WorkspaceId, @Maturity, @ActorUserId",
                new[]
                {
                    new SqlParameter("@RecordId", recordId),
                    new SqlParameter("@WorkspaceId", row.WorkspaceId),
                    new SqlParameter("@Maturity", maturity),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()),
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == NotFoundError)
        {
            return new FeatureWriteResult(FeatureWriteOutcome.NotFound);
        }

        await EmitAsync("feature.maturity-changed", row.WorkspaceId, recordId, actorUserId, new { maturity }, operationId, cancellationToken).ConfigureAwait(false);
        var dto = await GetByIdAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        return new FeatureWriteResult(FeatureWriteOutcome.Success, dto);
    }

    public async Task<AddToCatalogServiceResult> AddToCatalogAsync(
        string sourceRecordId, Guid actorUserId, CancellationToken cancellationToken)
    {
        // The source Request is read on the caller's side — forbidden OR non-existent → 403 (BS §22.6).
        var source = await _requests.GetByIdAsync(sourceRecordId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (source is null)
        {
            return new AddToCatalogServiceResult(AddToCatalogOutcome.DeniedSource);
        }

        var hubId = await ResolveHubWorkspaceIdAsync(cancellationToken).ConfigureAwait(false);
        if (hubId is not { } workspaceId)
        {
            return new AddToCatalogServiceResult(AddToCatalogOutcome.NoHubWorkspace);
        }

        if (!await _accessGuard.HasWorkspaceLevelAsync(actorUserId, workspaceId, WorkspaceLevel.Member, cancellationToken).ConfigureAwait(false))
        {
            return new AddToCatalogServiceResult(AddToCatalogOutcome.DeniedTarget);
        }

        // Same-field-identity prefill: Name (draft title + name), Tech/Stack, Solution Pattern, repo URL.
        var fields = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var key in CatalogPrefillKeys)
        {
            if (source.Fields.TryGetValue(key, out var value) && value.ValueKind != JsonValueKind.Null)
            {
                fields[key] = value.Clone();
            }
        }

        var save = new DraftSaveRequest
        {
            ObjectType = "Feature",
            Title = source.Name,
            Body = new DraftBodyInput
            {
                Fields = fields,
                QueuedLinks = new List<QueuedLinkInput>
                {
                    new() { ToRecordId = sourceRecordId, Kind = "sourced-from" },
                },
            },
        };

        var result = await _drafts.SaveAsync(workspaceId, actorUserId, save, cancellationToken).ConfigureAwait(false);
        return new AddToCatalogServiceResult(AddToCatalogOutcome.Success, result.Draft.Id);
    }

    // ─── List read (two result sets → raw ADO.NET) ─────────────────────────────

    public async Task<PaginatedResponse<FeatureListRowDto>?> QueryAsync(Guid userId, PaginatedQuery query, CancellationToken cancellationToken)
    {
        var hubId = await ResolveHubWorkspaceIdAsync(cancellationToken).ConfigureAwait(false);
        var page = query.Page < 1 ? 1 : query.Page;
        var pageSize = query.PageSize < 1 ? 20 : query.PageSize > 100 ? 100 : query.PageSize;
        if (hubId is not { } workspaceId)
        {
            return new PaginatedResponse<FeatureListRowDto>(Array.Empty<FeatureListRowDto>(), 0, page, pageSize);
        }

        // The catalog is AI-Solutions-workspace-scoped; a non-member gets 403 (null → controller maps it).
        // Firm-wide read-only access to Published features (Dashboard-viewer, BS §10.4) is slice 23.
        if (!await _accessGuard.HasWorkspaceLevelAsync(userId, workspaceId, WorkspaceLevel.Viewer, cancellationToken).ConfigureAwait(false))
        {
            return null;
        }

        var filtersJson = BuildFeatureFiltersJson(query.Filters);
        var (sortColumn, sortDirection) = ResolveFeatureSort(query.Sort);

        var rows = new List<FeatureListRowDto>();
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
                "EXEC dbo.usp_QueryFeatures @WorkspaceId, @Page, @PageSize, @FiltersJson, @SortColumn, @SortDir";
            command.Parameters.Add(new SqlParameter("@WorkspaceId", workspaceId.ToString()));
            command.Parameters.Add(new SqlParameter("@Page", page));
            command.Parameters.Add(new SqlParameter("@PageSize", pageSize));
            command.Parameters.Add(new SqlParameter("@FiltersJson", (object?)filtersJson ?? DBNull.Value));
            command.Parameters.Add(new SqlParameter("@SortColumn", sortColumn));
            command.Parameters.Add(new SqlParameter("@SortDir", sortDirection));

            await using var reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);

            var recordIdIndex = reader.GetOrdinal("RecordId");
            var nameIndex = reader.GetOrdinal("Name");
            var maturityIndex = reader.GetOrdinal("Maturity");
            var oneLinerIndex = reader.GetOrdinal("OneLiner");
            var typeIndex = reader.GetOrdinal("FeatureType");
            var ownerIndex = reader.GetOrdinal("OwnerUserId");
            var originIndex = reader.GetOrdinal("Origin");
            var fieldValuesIndex = reader.GetOrdinal("FieldValues");
            var updatedAtIndex = reader.GetOrdinal("UpdatedAt");
            var rowVerIndex = reader.GetOrdinal("RowVer");
            var thumbnailIndex = reader.GetOrdinal("ThumbnailAttachmentId");

            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                var fields = ParseFields(reader.IsDBNull(fieldValuesIndex) ? null : reader.GetString(fieldValuesIndex));
                // The first native image attachment feeds the S11 gallery thumbnail. The path is the
                // bearer-authenticated content endpoint; the SPA fetches it via the authenticated client.
                var thumbnailUrl = reader.IsDBNull(thumbnailIndex)
                    ? null
                    : $"/api/v1/attachments/{reader.GetGuid(thumbnailIndex):D}/content";
                rows.Add(new FeatureListRowDto(
                    Id: reader.GetString(recordIdIndex),
                    ETag: Convert.ToBase64String((byte[])reader.GetValue(rowVerIndex)),
                    Name: reader.IsDBNull(nameIndex) ? string.Empty : reader.GetString(nameIndex),
                    OneLiner: reader.IsDBNull(oneLinerIndex) ? string.Empty : reader.GetString(oneLinerIndex),
                    FeatureType: reader.IsDBNull(typeIndex) ? string.Empty : reader.GetString(typeIndex),
                    CapabilityTags: GetStringArray(fields, "capabilityTags"),
                    TechStack: GetStringArray(fields, "techStack"),
                    Owner: reader.IsDBNull(ownerIndex) ? string.Empty : reader.GetString(ownerIndex),
                    Maturity: reader.IsDBNull(maturityIndex) ? string.Empty : reader.GetString(maturityIndex),
                    Origin: reader.IsDBNull(originIndex) ? string.Empty : reader.GetString(originIndex),
                    UpdatedAt: DateTime.SpecifyKind(reader.GetDateTime(updatedAtIndex), DateTimeKind.Utc),
                    ThumbnailUrl: thumbnailUrl));
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

        return new PaginatedResponse<FeatureListRowDto>(rows, totalCount, page, pageSize);
    }

    // ─── Reads & mapping ───────────────────────────────────────────────────────

    private async Task<FeatureRow?> ReadRowAsync(string recordId, Guid userId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<FeatureRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetFeatureByIdForUser @RecordId, @UserId",
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return rows.FirstOrDefault();
    }

    private async Task<IReadOnlyList<string>> ReadSourcedFromAsync(string recordId, Guid userId, CancellationToken cancellationToken)
    {
        var links = await _typedLinks.GetLinksAsync(recordId, userId, cancellationToken).ConfigureAwait(false);
        return links is null
            ? Array.Empty<string>()
            : links.Where(link => string.Equals(link.Kind, "sourced-from", StringComparison.Ordinal))
                   .Select(link => link.ToRecordId)
                   .ToList();
    }

    private static FeatureDto MapRow(FeatureRow row, IReadOnlyList<string> sourcedFrom)
    {
        var fields = ParseFields(row.FieldValues);
        return new FeatureDto(
            Id: row.RecordId,
            WorkspaceId: row.WorkspaceId,
            CreatedAt: DateTime.SpecifyKind(row.CreatedAt, DateTimeKind.Utc),
            UpdatedAt: DateTime.SpecifyKind(row.UpdatedAt, DateTimeKind.Utc),
            CreatedBy: row.CreatedBy,
            UpdatedBy: row.UpdatedBy,
            Name: row.Name,
            OneLiner: GetString(fields, "oneLiner") ?? string.Empty,
            WhatItDoes: GetString(fields, "whatItDoes") ?? string.Empty,
            FeatureType: GetString(fields, "featureType") ?? string.Empty,
            CapabilityTags: GetStringArray(fields, "capabilityTags"),
            SolutionPattern: GetStringArray(fields, "solutionPattern"),
            TechStack: GetStringArray(fields, "techStack"),
            HowToReuse: GetString(fields, "howToReuse") ?? string.Empty,
            DemoUrl: GetString(fields, "demoUrl"),
            RepoUrl: GetString(fields, "repoUrl"),
            Owner: GetString(fields, "owner") ?? string.Empty,
            Maturity: row.Maturity,
            DataClassification: GetString(fields, "dataClassification"),
            ComplianceFlags: GetStringArray(fields, "complianceFlags"),
            SourcedFromRecordIds: sourcedFrom,
            ETag: Convert.ToBase64String(row.RowVer));
    }

    // ─── Hub resolution + field/filter/sort helpers ────────────────────────────

    private async Task<Guid?> ResolveHubWorkspaceIdAsync(CancellationToken cancellationToken)
    {
        var hub = await _db.Set<Workspace>()
            .Where(workspace => workspace.Kind == "ai-solutions" && !workspace.IsDeleted)
            .Select(workspace => (Guid?)workspace.WorkspaceId)
            .FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);
        return hub;
    }

    private static Dictionary<string, JsonElement> BuildFieldMap(FeatureCreateRequest request)
    {
        var map = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["oneLiner"] = request.OneLiner ?? string.Empty,
            ["whatItDoes"] = request.WhatItDoes ?? string.Empty,
            ["featureType"] = request.FeatureType,
            ["capabilityTags"] = request.CapabilityTags ?? Array.Empty<string>(),
            ["solutionPattern"] = request.SolutionPattern ?? Array.Empty<string>(),
            ["techStack"] = request.TechStack ?? Array.Empty<string>(),
            ["howToReuse"] = request.HowToReuse ?? string.Empty,
            ["demoUrl"] = request.DemoUrl,
            ["repoUrl"] = request.RepoUrl,
            ["owner"] = request.Owner,
            ["dataClassification"] = request.DataClassification,
            ["complianceFlags"] = request.ComplianceFlags ?? Array.Empty<string>(),
        };

        // Round-trip through JSON so every value is a JsonElement (uniform with the patch/merge path).
        var json = JsonSerializer.Serialize(map, JsonOptions);
        return ParseFields(json);
    }

    private static string? BuildQueuedLinksJson(IReadOnlyList<QueuedLinkInput>? queuedLinks)
    {
        if (queuedLinks is null || queuedLinks.Count == 0)
        {
            return null;
        }

        var links = queuedLinks
            .Where(link => !string.IsNullOrWhiteSpace(link.ToRecordId))
            .Select(link => new { toRecordId = link.ToRecordId, kind = string.IsNullOrWhiteSpace(link.Kind) ? "sourced-from" : link.Kind })
            .ToList();
        return links.Count == 0 ? null : JsonSerializer.Serialize(links, JsonOptions);
    }

    /// <summary>Translate the generic FilterClause map into the shape usp_QueryFeatures parses.</summary>
    private static string? BuildFeatureFiltersJson(Dictionary<string, JsonElement>? filters)
    {
        if (filters is null || filters.Count == 0)
        {
            return null;
        }

        var output = new Dictionary<string, object?>(StringComparer.Ordinal);
        AddSelectFilter(filters, "maturity", "maturity", output);
        AddSelectFilter(filters, "featureType", "featureType", output);
        AddSelectFilter(filters, "techStack", "techStack", output);
        AddSelectFilter(filters, "capabilityTags", "capabilityTags", output);

        if (filters.TryGetValue("name", out var name) && name.ValueKind == JsonValueKind.Object
            && name.TryGetProperty("contains", out var contains) && contains.ValueKind == JsonValueKind.String)
        {
            var text = contains.GetString();
            if (!string.IsNullOrWhiteSpace(text))
            {
                output["nameContains"] = text;
            }
        }

        return output.Count == 0 ? null : JsonSerializer.Serialize(output, JsonOptions);
    }

    private static void AddSelectFilter(
        Dictionary<string, JsonElement> filters, string sourceKey, string targetKey, Dictionary<string, object?> output)
    {
        if (filters.TryGetValue(sourceKey, out var clause) && clause.ValueKind == JsonValueKind.Object
            && clause.TryGetProperty("values", out var values) && values.ValueKind == JsonValueKind.Array)
        {
            var list = values.EnumerateArray()
                .Where(value => value.ValueKind == JsonValueKind.String)
                .Select(value => value.GetString())
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .ToList();
            if (list.Count > 0)
            {
                output[targetKey] = list;
            }
        }
    }

    private static (string Column, string Direction) ResolveFeatureSort(IReadOnlyList<SortSpec>? sort)
    {
        var first = sort?.FirstOrDefault(spec => !string.IsNullOrWhiteSpace(spec.Column));
        var direction = string.Equals(first?.Direction, "asc", StringComparison.OrdinalIgnoreCase) ? "asc" : "desc";
        var column = (first?.Column?.ToLowerInvariant()) switch
        {
            "id" => "id",
            "name" => "name",
            "featuretype" or "type" => "type",
            "maturity" => "maturity",
            "updatedat" or "updated" => "updated",
            _ => "updated",
        };
        return (column, direction);
    }

    private async Task EmitAsync(
        string eventType, Guid workspaceId, string recordId, Guid actorUserId, object payloadObject, string operationId, CancellationToken cancellationToken)
    {
        var payload = JsonSerializer.Serialize(payloadObject, JsonOptions);
        var envelope = new EventEnvelope(
            Guid.NewGuid(), eventType, workspaceId, recordId, actorUserId, _clock.UtcNow, payload, operationId);
        await _eventSpine.EmitAsync(envelope, cancellationToken).ConfigureAwait(false);
    }

    private static Dictionary<string, JsonElement> ParseFields(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        }

        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json, JsonOptions)
                ?? new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        }
        catch (JsonException)
        {
            return new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        }
    }

    private static Dictionary<string, JsonElement> MergeFields(
        Dictionary<string, JsonElement> current, IReadOnlyDictionary<string, JsonElement>? patch)
    {
        var merged = new Dictionary<string, JsonElement>(current, StringComparer.Ordinal);
        if (patch is not null)
        {
            foreach (var entry in patch)
            {
                merged[entry.Key] = entry.Value;
            }
        }

        return merged;
    }

    private static string? GetString(IReadOnlyDictionary<string, JsonElement> fields, string key) =>
        fields.TryGetValue(key, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static IReadOnlyList<string> GetStringArray(IReadOnlyDictionary<string, JsonElement> fields, string key)
    {
        if (!fields.TryGetValue(key, out var value) || value.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<string>();
        }

        return value.EnumerateArray()
            .Where(item => item.ValueKind == JsonValueKind.String)
            .Select(item => item.GetString()!)
            .ToList();
    }

    private static bool TryDecodeRowVer(string? eTag, out byte[] rowVer)
    {
        rowVer = Array.Empty<byte>();
        if (string.IsNullOrWhiteSpace(eTag))
        {
            return false;
        }

        try
        {
            var bytes = Convert.FromBase64String(eTag);
            if (bytes.Length != 8)
            {
                return false;
            }

            rowVer = bytes;
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
