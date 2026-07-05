// RequestsService — read, mapping, serialization, and pure validation helpers. Split from the
// mutation half (RequestsService.cs). The list read (usp_QueryRequests) returns two result sets
// (page rows + total count), which FromSqlRaw cannot bind, so it runs through raw ADO.NET on the
// context's connection with every value parameterised (api-data-access.md). Every other read binds
// a keyless projection via FromSqlRaw. Field values are Confidential and never logged.

using System.Data;
using System.Data.Common;
using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Requests;

public sealed partial class RequestsService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static readonly IReadOnlyDictionary<string, JsonElement> EmptyFields =
        new Dictionary<string, JsonElement>(StringComparer.Ordinal);

    // ─── The list read (two result sets → raw ADO.NET) ─────────────────────────

    public async Task<PaginatedResponse<RequestListRow>> QueryAsync(
        Guid workspaceId, PaginatedQuery query, CancellationToken cancellationToken)
    {
        var page = query.Page < 1 ? 1 : query.Page;
        var pageSize = query.PageSize < 1 ? 20 : query.PageSize > 100 ? 100 : query.PageSize;
        var filtersJson = BuildFiltersJson(query.Filters);
        var (sortColumn, sortDirection) = ResolveSort(query.Sort);
        var today = DateOnly.FromDateTime(_clock.UtcNow.UtcDateTime);

        var rows = new List<RequestListRow>();
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
                "EXEC dbo.usp_QueryRequests @WorkspaceId, @Page, @PageSize, @FiltersJson, @SortColumn, @SortDir";
            command.Parameters.Add(new SqlParameter("@WorkspaceId", workspaceId.ToString()));
            command.Parameters.Add(new SqlParameter("@Page", page));
            command.Parameters.Add(new SqlParameter("@PageSize", pageSize));
            command.Parameters.Add(new SqlParameter("@FiltersJson", (object?)filtersJson ?? DBNull.Value));
            command.Parameters.Add(new SqlParameter("@SortColumn", sortColumn));
            command.Parameters.Add(new SqlParameter("@SortDir", sortDirection));

            await using var reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);

            var recordIdIndex = reader.GetOrdinal("RecordId");
            var nameIndex = reader.GetOrdinal("Name");
            var descriptionIndex = reader.GetOrdinal("Description");
            var stageIndex = reader.GetOrdinal("Stage");
            var deptIndex = reader.GetOrdinal("DeptPgClient");
            var analystIndex = reader.GetOrdinal("AssignedAnalyst");
            var dueIndex = reader.GetOrdinal("DueDate");
            var priorityIndex = reader.GetOrdinal("PriorityScore");
            var rowVerIndex = reader.GetOrdinal("RowVer");
            // Field-as-column rollup (slice 7): the first task-level URL field value, surfaced as the
            // Repo URL list column. NULL when the record has no URL-type task field yet.
            var repoIndex = reader.GetOrdinal("RepoUrl");

            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                var recordId = reader.GetString(recordIdIndex);
                var eTag = Convert.ToBase64String((byte[])reader.GetValue(rowVerIndex));
                DateOnly? due = reader.IsDBNull(dueIndex) ? null : DateOnly.FromDateTime(reader.GetDateTime(dueIndex));

                var columns = new Dictionary<string, object?>(StringComparer.Ordinal)
                {
                    ["id"] = recordId,
                    ["name"] = reader.IsDBNull(nameIndex) ? null : reader.GetString(nameIndex),
                    ["desc"] = reader.IsDBNull(descriptionIndex) ? null : reader.GetString(descriptionIndex),
                    ["stage"] = reader.IsDBNull(stageIndex) ? null : reader.GetString(stageIndex),
                    ["origin"] = reader.IsDBNull(deptIndex) ? null : reader.GetString(deptIndex),
                    ["analyst"] = reader.IsDBNull(analystIndex) ? null : reader.GetString(analystIndex),
                    ["priority"] = reader.IsDBNull(priorityIndex) ? null : Convert.ToInt32(reader.GetValue(priorityIndex)),
                    ["repo"] = reader.IsDBNull(repoIndex) ? null : reader.GetString(repoIndex),
                    ["due"] = due?.ToString("yyyy-MM-dd"),
                };

                rows.Add(new RequestListRow(recordId, eTag, columns, ComputeSla(due, today)));
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

        return new PaginatedResponse<RequestListRow>(rows, totalCount, page, pageSize);
    }

    // ─── Similar-requests nudge (FromSqlRaw; access baked into the proc join) ───

    public async Task<IReadOnlyList<SimilarRequestDto>> FindSimilarAsync(
        Guid workspaceId, Guid userId, string? query, int top, CancellationToken cancellationToken)
    {
        var trimmed = query?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return Array.Empty<SimilarRequestDto>();
        }

        var rows = await _db.Set<SimilarRequestRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_FindSimilarRequests @WorkspaceId, @UserId, @Query, @Top",
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@UserId", userId),
                new SqlParameter("@Query", trimmed),
                new SqlParameter("@Top", top))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return rows
            .Select(row => new SimilarRequestDto(row.RecordId, row.Name, row.Stage ?? string.Empty, row.Origin ?? string.Empty))
            .ToList();
    }

    // ─── Single-row + lifecycle reads (FromSqlRaw) ─────────────────────────────

    private async Task<RequestRow?> ReadRowAsync(string recordId, Guid userId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<RequestRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetRequestByIdForUser @RecordId, @UserId",
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return rows.FirstOrDefault();
    }

    private async Task<RequestDto?> ReadAndMapAsync(string recordId, Guid userId, CancellationToken cancellationToken)
    {
        var row = await ReadRowAsync(recordId, userId, cancellationToken).ConfigureAwait(false);
        if (row is null)
        {
            return null;
        }

        var stages = await GetStageRefsAsync(row.WorkspaceId, row.LifecycleId, cancellationToken).ConfigureAwait(false);
        var dto = MapRow(row, stages);

        // Escalated records carry a bridge block — the "Escalated · [origin]" pill, the mirror status,
        // and the PG-side locked-field keys (BS §6.4). Non-escalated records get null (one extra proc
        // call only when the record has a bridge to describe).
        var bridge = await _bridge.ReadAsync(recordId, userId, cancellationToken).ConfigureAwait(false);
        return bridge is null ? dto : dto with { Bridge = ComposeBridge(bridge) };
    }

    private async Task<IReadOnlyList<LifecycleRow>> ReadLifecyclesAsync(Guid workspaceId, CancellationToken cancellationToken) =>
        await _db.Set<LifecycleRow>()
            .FromSqlRaw("EXEC dbo.usp_GetWorkspaceLifecycles @WorkspaceId", new SqlParameter("@WorkspaceId", workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

    private async Task<IReadOnlyList<StageDefinitionRow>> ReadStagesAsync(Guid workspaceId, CancellationToken cancellationToken) =>
        await _db.Set<StageDefinitionRow>()
            .FromSqlRaw("EXEC dbo.usp_GetWorkspaceStages @WorkspaceId", new SqlParameter("@WorkspaceId", workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

    private async Task<IReadOnlyList<RequestStageRef>> GetStageRefsAsync(
        Guid workspaceId, Guid lifecycleId, CancellationToken cancellationToken)
    {
        var stages = await ReadStagesAsync(workspaceId, cancellationToken).ConfigureAwait(false);
        return stages
            .Where(stage => stage.LifecycleId == lifecycleId)
            .OrderBy(stage => stage.SortOrder)
            .Select(stage => new RequestStageRef(stage.StageKey, stage.Label))
            .ToList();
    }

    // ─── Mapping ───────────────────────────────────────────────────────────────

    private static RequestDto MapRow(RequestRow row, IReadOnlyList<RequestStageRef> stages)
    {
        var fields = ParseFields(row.FieldValues);
        var held = string.Equals(GetString(fields, "holdBlocked"), "true", StringComparison.OrdinalIgnoreCase);
        var reason = GetString(fields, "holdReason");

        return new RequestDto(
            Id: row.RecordId,
            WorkspaceId: row.WorkspaceId,
            Origin: row.Origin,
            CreatedAt: DateTime.SpecifyKind(row.CreatedAt, DateTimeKind.Utc),
            UpdatedAt: DateTime.SpecifyKind(row.UpdatedAt, DateTimeKind.Utc),
            CreatedBy: row.CreatedBy,
            UpdatedBy: row.UpdatedBy,
            LegacyId: null,
            LifecycleId: row.LifecycleId,
            Stages: stages,
            Stage: string.IsNullOrEmpty(row.Stage) ? null : row.Stage,
            Hold: new HoldState(held, held ? reason : null),
            Outcome: null,
            DisplayStatus: DeriveDisplayStatus(fields, row.Stage, stages),
            SlaStatus: null,
            Name: row.Name,
            Description: row.Description,
            Fields: fields,
            Bridge: null,
            ETag: Convert.ToBase64String(row.RowVer));
    }

    // ─── Escalation bridge composition (slice 9) ──────────────────────────────

    /// <summary>Platform-defined field keys with no manual write path at any access level (BS §4.3/§6.4).</summary>
    private static readonly HashSet<string> PlatformLockedKeys = new(StringComparer.Ordinal)
    {
        "ai-solutions-status", "record-id", "workspace", "origin", "created-at", "updated-at",
    };

    private static BridgeBlockDto ComposeBridge(BridgeRow row) =>
        new(
            IsEscalated: true,
            OriginWorkspaceId: row.OriginWorkspaceId,
            OriginWorkspaceName: row.OriginWorkspaceName,
            AiWorkspaceId: row.AiWorkspaceId,
            EscalatedAt: DateTime.SpecifyKind(row.EscalatedAt, DateTimeKind.Utc),
            AiSolutionsStatus: DeriveMirrorStatus(row.AiStage, row.AiFieldValues),
            LockedFields: ParseLockedFieldKeys(row.LockedFieldKeysJson));

    /// <summary>
    /// The PG-side AI Solutions Status mirror — derived read-time from the AI-side record's current
    /// stage + hold/outcome (BS §6.4; slice-9 read-time-derivation decision). Deploy and Post-launch
    /// both collapse to "Deployed" so the PG side sees neither distinctly. Pure — unit-tested.
    /// </summary>
    public static string DeriveMirrorStatus(string aiStage, string aiFieldValues)
    {
        var fields = ParseFields(aiFieldValues);

        var outcome = GetString(fields, "outcome");
        if (!string.IsNullOrWhiteSpace(outcome))
        {
            return outcome!;
        }

        if (string.Equals(GetString(fields, "holdBlocked"), "true", StringComparison.OrdinalIgnoreCase))
        {
            return "On hold";
        }

        return (aiStage?.ToLowerInvariant()) switch
        {
            "intake" => "Intake",
            "discovery" => "Discovery",
            "build" => "Build",
            "qa" => "QA",
            "deploy" => "Deployed",
            "post-launch" => "Deployed",
            _ => string.IsNullOrEmpty(aiStage) ? string.Empty : aiStage,
        };
    }

    /// <summary>
    /// Pure locked-field check (unit-tested). A patch violates the lock when it touches a platform-defined
    /// key (never writable) OR changes any of <paramref name="lockedKeys"/> — the PG-side crossing fields
    /// frozen on escalation — to a value different from what's stored. Name/Description are compared against
    /// the record's columns; other keys against the stored field map. An unchanged value is allowed (the UI
    /// re-sends name/description on every autosave).
    /// </summary>
    public static bool IsLockedFieldViolation(
        RequestPatchRequest request,
        IReadOnlyList<string> lockedKeys,
        string storedName,
        string storedDescription,
        IReadOnlyDictionary<string, JsonElement> storedFields)
    {
        if (request.Fields is not null && request.Fields.Keys.Any(PlatformLockedKeys.Contains))
        {
            return true;
        }

        foreach (var key in lockedKeys)
        {
            switch (key)
            {
                case "name" when request.Name is not null && !string.Equals(request.Name, storedName, StringComparison.Ordinal):
                    return true;
                case "description" when request.Description is not null && !string.Equals(request.Description, storedDescription, StringComparison.Ordinal):
                    return true;
                case "name":
                case "description":
                    continue;
                default:
                    if (request.Fields is not null && request.Fields.TryGetValue(key, out var incoming))
                    {
                        var storedRaw = storedFields.TryGetValue(key, out var current) ? current.GetRawText() : null;
                        if (!string.Equals(incoming.GetRawText(), storedRaw, StringComparison.Ordinal))
                        {
                            return true;
                        }
                    }

                    continue;
            }
        }

        return false;
    }

    /// <summary>Parse the locked crossing-field keys from usp_GetBridgeForRecord's `[{"key":"…"}]` JSON.</summary>
    public static IReadOnlyList<string> ParseLockedFieldKeys(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return Array.Empty<string>();
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind != JsonValueKind.Array)
            {
                return Array.Empty<string>();
            }

            var keys = new List<string>();
            foreach (var item in document.RootElement.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.Object
                    && item.TryGetProperty("key", out var key)
                    && key.ValueKind == JsonValueKind.String)
                {
                    keys.Add(key.GetString()!);
                }
            }

            return keys;
        }
        catch (JsonException)
        {
            return Array.Empty<string>();
        }
    }

    // ─── Pure helpers (unit-tested without a database) ─────────────────────────

    /// <summary>Cross-field create validation the DTO annotations can't express (BS §3.5).</summary>
    public static Dictionary<string, string[]> ValidateCreate(RequestCreateRequest request)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            errors["name"] = new[] { "A request name is required." };
        }

        var fields = request.Fields;
        if (string.Equals(GetString(fields, "deptPgClient"), "Client", StringComparison.OrdinalIgnoreCase)
            && string.IsNullOrWhiteSpace(GetString(fields, "clientNumber")))
        {
            errors["clientNumber"] = new[] { "A client number is required when Dept/PG/Client is Client." };
        }

        ValidateScore(fields, "businessValue", "Business Value", errors);
        ValidateScore(fields, "efficiencyGain", "Efficiency Gain", errors);
        ValidateScore(fields, "levelOfEffort", "Level of Effort", errors);

        return errors;
    }

    private static void ValidateScore(
        IReadOnlyDictionary<string, JsonElement>? fields, string key, string label, Dictionary<string, string[]> errors)
    {
        if (fields is null || !fields.TryGetValue(key, out var element) || element.ValueKind == JsonValueKind.Null)
        {
            return;
        }

        if (!TryReadInt(element, out var value) || value < 1 || value > 5)
        {
            errors[key] = new[] { $"{label} must be a whole number from 1 to 5." };
        }
    }

    /// <summary>Translate the S2 grid filter map into the JSON shape usp_QueryRequests expects.</summary>
    public static string? BuildFiltersJson(IReadOnlyDictionary<string, JsonElement>? filters)
    {
        if (filters is null || filters.Count == 0)
        {
            return null;
        }

        var payload = new Dictionary<string, object?>(StringComparer.Ordinal);

        if (TryGetSelectValues(filters, "stage", out var stageValues))
        {
            payload["stage"] = stageValues;
        }

        if (TryGetSelectValues(filters, "origin", out var originValues))
        {
            payload["deptPgClient"] = originValues;
        }

        if (TryGetSelectValues(filters, "analyst", out var analystValues))
        {
            payload["analyst"] = analystValues;
        }

        if (TryGetTextContains(filters, "name", out var nameContains))
        {
            payload["nameContains"] = nameContains;
        }

        if (filters.TryGetValue("priority", out var priority) && priority.ValueKind == JsonValueKind.Object)
        {
            var op = ReadStringProperty(priority, "op");
            if (op is not null && TryReadIntProperty(priority, "value", out var priorityValue))
            {
                payload["priorityOp"] = op;
                payload["priorityValue"] = priorityValue;
            }
        }

        if (filters.TryGetValue("due", out var due) && due.ValueKind == JsonValueKind.Object)
        {
            var from = ReadStringProperty(due, "from");
            var to = ReadStringProperty(due, "to");
            if (from is not null)
            {
                payload["dueFrom"] = from;
            }

            if (to is not null)
            {
                payload["dueTo"] = to;
            }
        }

        return payload.Count == 0 ? null : JsonSerializer.Serialize(payload, JsonOptions);
    }

    /// <summary>Map the first sort directive's grid column onto a whitelisted proc sort column.</summary>
    public static (string Column, string Direction) ResolveSort(IReadOnlyList<SortSpec>? sort)
    {
        var first = sort?.FirstOrDefault(spec => !string.IsNullOrWhiteSpace(spec.Column));
        var column = (first?.Column?.ToLowerInvariant()) switch
        {
            "id" => "id",
            "name" => "name",
            "stage" => "stage",
            "origin" => "origin",
            "analyst" => "analyst",
            "priority" => "priority",
            "due" => "due",
            _ => "due",
        };
        var direction = string.Equals(first?.Direction, "desc", StringComparison.OrdinalIgnoreCase) ? "desc" : "asc";
        return (column, direction);
    }

    private static string DeriveDisplayStatus(
        IReadOnlyDictionary<string, JsonElement> fields, string stageKey, IReadOnlyList<RequestStageRef> stages)
    {
        var outcome = GetString(fields, "outcome");
        if (!string.IsNullOrWhiteSpace(outcome))
        {
            return outcome!;
        }

        if (string.Equals(GetString(fields, "holdBlocked"), "true", StringComparison.OrdinalIgnoreCase))
        {
            return "On hold";
        }

        var match = stages.FirstOrDefault(stage => string.Equals(stage.Key, stageKey, StringComparison.Ordinal));
        return match?.Label ?? (string.IsNullOrEmpty(stageKey) ? string.Empty : stageKey);
    }

    /// <summary>Simple slice-5 SLA compute — Phase 2 owns the real derivation.</summary>
    public static string? ComputeSla(DateOnly? due, DateOnly today)
    {
        if (due is null)
        {
            return null;
        }

        if (due < today)
        {
            return "Overdue";
        }

        return due <= today.AddDays(3) ? "DueSoon" : null;
    }

    private static string SerializeFields(IReadOnlyDictionary<string, JsonElement>? fields) =>
        JsonSerializer.Serialize(fields ?? EmptyFields, JsonOptions);

    private static string SerializeFieldsDictionary(IReadOnlyDictionary<string, JsonElement> fields) =>
        JsonSerializer.Serialize(fields, JsonOptions);

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

    private static string? GetString(IReadOnlyDictionary<string, JsonElement>? fields, string key)
    {
        if (fields is null || !fields.TryGetValue(key, out var element))
        {
            return null;
        }

        return element.ValueKind switch
        {
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Number => element.ToString(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => null,
        };
    }

    private static bool TryReadInt(JsonElement element, out int value)
    {
        value = 0;
        if (element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out value))
        {
            return true;
        }

        return element.ValueKind == JsonValueKind.String && int.TryParse(element.GetString(), out value);
    }

    private static bool TryGetSelectValues(
        IReadOnlyDictionary<string, JsonElement> filters, string key, out List<string> values)
    {
        values = new List<string>();
        if (!filters.TryGetValue(key, out var clause) || clause.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        if (clause.TryGetProperty("values", out var selectArray) && selectArray.ValueKind == JsonValueKind.Array)
        {
            values = ReadStringArray(selectArray);
        }
        else if (clause.TryGetProperty("userIds", out var userArray) && userArray.ValueKind == JsonValueKind.Array)
        {
            values = ReadStringArray(userArray);
        }

        return values.Count > 0;
    }

    private static bool TryGetTextContains(
        IReadOnlyDictionary<string, JsonElement> filters, string key, out string? contains)
    {
        contains = null;
        if (!filters.TryGetValue(key, out var clause) || clause.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        if (clause.TryGetProperty("contains", out var value)
            && value.ValueKind == JsonValueKind.String
            && !string.IsNullOrWhiteSpace(value.GetString()))
        {
            contains = value.GetString();
            return true;
        }

        return false;
    }

    private static List<string> ReadStringArray(JsonElement array) =>
        array.EnumerateArray()
            .Where(element => element.ValueKind == JsonValueKind.String)
            .Select(element => element.GetString()!)
            .ToList();

    private static string? ReadStringProperty(JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString(),
            JsonValueKind.Number => value.ToString(),
            _ => null,
        };
    }

    private static bool TryReadIntProperty(JsonElement element, string name, out int value)
    {
        value = 0;
        return element.TryGetProperty(name, out var property) && TryReadInt(property, out value);
    }
}
