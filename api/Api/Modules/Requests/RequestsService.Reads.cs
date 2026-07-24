// RequestsService — read, mapping, serialization, and pure validation helpers. Split from the
// mutation half (RequestsService.cs). The list read (usp_QueryRequests) returns two result sets
// (page rows + total count), which FromSqlRaw cannot bind, so it runs through raw ADO.NET on the
// context's connection with every value parameterised (api-data-access.md). Every other read binds
// a keyless projection via FromSqlRaw. Field values are Confidential and never logged.

using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Requests;

public sealed partial class RequestsService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

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
            // Slice 26 — StatusHold column drives the S2 row pill without a per-row detail fetch.
            var statusHoldIndex = reader.GetOrdinal("StatusHold");
            // The workspace's due-soon window (slice 21) — constant across the page; drives SLA Status.
            var dueSoonWindowIndex = reader.GetOrdinal("DueSoonWindowDays");

            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                var recordId = reader.GetString(recordIdIndex);
                var eTag = Convert.ToBase64String((byte[])reader.GetValue(rowVerIndex));
                DateOnly? due = reader.IsDBNull(dueIndex) ? null : DateOnly.FromDateTime(reader.GetDateTime(dueIndex));
                var dueSoonWindow = reader.GetInt32(dueSoonWindowIndex);

                var statusHold = reader.IsDBNull(statusHoldIndex) ? "InProgress" : reader.GetString(statusHoldIndex);

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

                rows.Add(new RequestListRow(recordId, eTag, columns, ComputeSla(due, today, dueSoonWindow), ParseStatusHold(statusHold)));
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

    // ─── Export reads (S28 wizard; field-surfacing sweep slice 3a) ─────────────

    public async Task<IReadOnlyList<RequestExportField>> GetRequestExportFieldsAsync(
        Guid workspaceId, CancellationToken cancellationToken)
    {
        // The same catalog the Fields tab reads, so the export picker cannot drift from it. The proc
        // returns every object type in (ObjectType, SortOrder, DisplayName) order; keep the non-retired
        // Request rows in that order so the export columns match the catalog exactly.
        var rows = await _db.Set<FieldCatalogRow>()
            .FromSqlRaw("EXEC dbo.usp_GetWorkspaceFieldCatalog @WorkspaceId", new SqlParameter("@WorkspaceId", workspaceId))
            .AsNoTracking()
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return rows
            .Where(row => string.Equals(row.ObjectType, "Request", StringComparison.Ordinal) && !row.IsRetired)
            .Select(row => new RequestExportField(row.FieldKey, row.DisplayName))
            .ToList();
    }

    public async Task<IReadOnlyList<WorkspaceRequestExportRow>> QueryWorkspaceRequestExportAsync(
        Guid workspaceId, int page, int pageSize, CancellationToken cancellationToken)
    {
        // Workspace-scoped read; ExportService has already gated the caller's Viewer membership on
        // @WorkspaceId (BS §22.4 — export never widens access). No further per-user filter here.
        return await _db.Set<WorkspaceRequestExportRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetRequestsForWorkspace @WorkspaceId, @Page, @PageSize",
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@Page", page),
                new SqlParameter("@PageSize", pageSize))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
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
        // The lifecycle's display name for the S4 Status-tab summary row. usp_GetWorkspaceLifecycles
        // already returns Name (the data was dropped at the DTO boundary before this slice); one extra
        // read on the detail path only. Empty string when the lifecycle can't be resolved (defensive).
        var lifecycles = await ReadLifecyclesAsync(row.WorkspaceId, cancellationToken).ConfigureAwait(false);
        var lifecycleName = lifecycles.FirstOrDefault(lifecycle => lifecycle.LifecycleId == row.LifecycleId)?.Name ?? string.Empty;
        var today = DateOnly.FromDateTime(_clock.UtcNow.UtcDateTime);
        var dto = MapRow(row, stages, lifecycleName, today);

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
            .Select(stage => new RequestStageRef(stage.StageKey, stage.Label, stage.StatusCategory))
            .ToList();
    }

    // ─── Mapping ───────────────────────────────────────────────────────────────

    private static RequestDto MapRow(RequestRow row, IReadOnlyList<RequestStageRef> stages, string lifecycleName, DateOnly today)
    {
        var fields = ParseFields(row.FieldValues);
        // StatusHold is the source of truth; the legacy `hold` block is a derived read computed from
        // StatusHold ('OnHold' → held). (close/status cleanup — 'Abandoned' retired; dropping a record
        // is now a Close outcome, not a hold state.)
        var statusHold = ParseStatusHold(row.StatusHold);
        var held = statusHold == RequestStatusHoldValue.OnHold;
        var reason = statusHold == RequestStatusHoldValue.InProgress ? null : row.StatusHoldNote;

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
            LifecycleName: lifecycleName,
            Stages: stages,
            Stage: string.IsNullOrEmpty(row.Stage) ? null : row.Stage,
            StatusHold: statusHold,
            StatusHoldNote: reason,
            Hold: new HoldState(held, held ? reason : null),
            Outcome: MapOutcome(fields),
            DisplayStatus: DeriveDisplayStatus(fields, row.Stage, stages),
            SlaStatus: ComputeSla(row.DueDate, today, row.DueSoonWindowDays),
            TimeInStage: ComputeTimeInStage(row.Stage, row.StageEnteredAt, today),
            Name: row.Name,
            Description: row.Description,
            Fields: fields,
            Bridge: null,
            ETag: Convert.ToBase64String(row.RowVer));
    }

    /// <summary>Parse the DB StatusHold string into the enum. Defaults to <c>InProgress</c> on unknown values (defensive).</summary>
    public static RequestStatusHoldValue ParseStatusHold(string? statusHold) => statusHold switch
    {
        "OnHold" => RequestStatusHoldValue.OnHold,
        // Any legacy "Abandoned" (retired) defensively reads as InProgress — migration 073 closed
        // those records, so none should remain.
        _ => RequestStatusHoldValue.InProgress,
    };

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
    /// stage + hold/outcome (BS §6.4; slice-9 read-time-derivation decision). Delivery, Stabilization
    /// and Closure all collapse to "Delivered" so the PG side sees none of them distinctly. Pure — unit-tested.
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
            "triage" => "Triage",
            "execution" => "Execution",
            "validation" => "Validation",
            "delivery" => "Delivered",
            "stabilization" => "Delivered",
            "closeout" => "Delivered",
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

    /// <summary>
    /// SLA Status (BS §17.2), derived from Due Date vs the current date and the workspace's due-soon
    /// window. Overdue when the due date is past; Due soon within the window; On track beyond it. No due
    /// date → null (no SLA, no aging tint). A non-positive window collapses the Due-soon band. Pure.
    /// </summary>
    public static string? ComputeSla(DateOnly? due, DateOnly today, int dueSoonWindowDays)
    {
        if (due is null)
        {
            return null;
        }

        if (due < today)
        {
            return "Overdue";
        }

        var window = dueSoonWindowDays < 0 ? 0 : dueSoonWindowDays;
        return due <= today.AddDays(window) ? "DueSoon" : "OnTrack";
    }

    /// <summary>
    /// Time-in-stage (BS §10.6) — whole days from when the current stage was entered to today. Null when
    /// the stage or its entry time is unknown (a never-transitioned legacy row); never negative. Pure.
    /// </summary>
    public static TimeInStageDto? ComputeTimeInStage(string? stageKey, DateTime? stageEnteredAt, DateOnly today)
    {
        if (string.IsNullOrEmpty(stageKey) || stageEnteredAt is null)
        {
            return null;
        }

        var enteredDate = DateOnly.FromDateTime(stageEnteredAt.Value);
        var days = today.DayNumber - enteredDate.DayNumber;
        return new TimeInStageDto(stageKey, days < 0 ? 0 : days);
    }

    /// <summary>
    /// Build the queued-links JSON for usp_CreateRequest from a create request — merges the
    /// similar-requests nudge's <c>related</c> ids and Copy/Promote's kinded link-backs into one
    /// `[{ toRecordId, kind }]` array (slice 10). Returns null when there is nothing to stamp. Pure.
    /// </summary>
    public static string? BuildQueuedLinksJson(RequestCreateRequest request)
    {
        var links = new List<object>();

        if (request.QueuedRelatedRecordIds is not null)
        {
            foreach (var toRecordId in request.QueuedRelatedRecordIds)
            {
                if (!string.IsNullOrWhiteSpace(toRecordId))
                {
                    links.Add(new { toRecordId = toRecordId.Trim(), kind = "related" });
                }
            }
        }

        if (request.QueuedLinks is not null)
        {
            foreach (var link in request.QueuedLinks)
            {
                if (!string.IsNullOrWhiteSpace(link.ToRecordId))
                {
                    links.Add(new { toRecordId = link.ToRecordId!.Trim(), kind = string.IsNullOrWhiteSpace(link.Kind) ? "related" : link.Kind });
                }
            }
        }

        return links.Count == 0 ? null : JsonSerializer.Serialize(links, JsonOptions);
    }

    /// <summary>
    /// Build the Outcome block from the record's field map — set by closure (slice 10; usp_CloseRequest
    /// writes $.outcome / $.outcomeKind / $.outcomeNotes / $.duplicateOfRecordId into FieldValues).
    /// Null until the record is closed. Pure — unit-tested.
    /// </summary>
    public static OutcomeDto? MapOutcome(IReadOnlyDictionary<string, JsonElement> fields)
    {
        var value = GetString(fields, "outcome");
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var kind = GetString(fields, "outcomeKind");
        var notes = GetString(fields, "outcomeNotes") ?? string.Empty;
        var duplicateOf = GetString(fields, "duplicateOfRecordId");
        return new OutcomeDto(
            Kind: string.IsNullOrWhiteSpace(kind) ? "delivery" : kind!,
            Value: value!,
            Notes: notes,
            DuplicateOfRecordId: string.IsNullOrWhiteSpace(duplicateOf) ? null : duplicateOf);
    }

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

    // ─── Benefit-review-date default (triggers slice 3, BS §17.11) ─────────────

    internal const string DeployDateKey = "deployDate";
    internal const string BenefitReviewDateKey = "benefitReviewDate";
    internal const string BenefitReviewManualKey = "benefitReviewDateIsManual";

    /// <summary>True when a patch's field map set/changed either benefit-review derivation input
    /// (deployDate or benefitReviewDate) — the only case that warrants reading the offset + deriving.</summary>
    private static bool TouchesBenefitReviewInputs(IReadOnlyDictionary<string, JsonElement>? fields) =>
        fields is not null && (fields.ContainsKey(DeployDateKey) || fields.ContainsKey(BenefitReviewDateKey));

    /// <summary>Read the workspace's Benefit-review offset (days). Single-table EF read (api-data-access.md);
    /// the column is NOT NULL with a DB default of 90, so a live workspace always yields a concrete value.</summary>
    private async Task<int> ReadBenefitReviewOffsetDaysAsync(Guid workspaceId, CancellationToken cancellationToken) =>
        await _db.Workspaces
            .AsNoTracking()
            .Where(workspace => workspace.WorkspaceId == workspaceId && !workspace.IsDeleted)
            .Select(workspace => workspace.BenefitReviewOffsetDays)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

    /// <summary>
    /// Default a request's Benefit-review date from its Deploy Date. When <paramref name="patchFields"/>
    /// directly sets benefitReviewDate, the record is flagged manual and that value is honored (never
    /// recomputed). Otherwise, when the patch set/changed deployDate and the record has not been manually
    /// overridden, benefitReviewDate is (re)computed as deployDate + <paramref name="offsetDays"/>. A
    /// hand-set value is never clobbered (plan Open Q2: recompute only if unedited). Mutates
    /// <paramref name="mergedFields"/> in place. Pure — unit-tested.
    /// </summary>
    public static void ApplyBenefitReviewDerivation(
        Dictionary<string, JsonElement> mergedFields,
        IReadOnlyDictionary<string, JsonElement>? patchFields,
        int offsetDays)
    {
        // A direct edit to benefitReviewDate marks the record manual so future deployDate moves never
        // clobber it. The user's value is already merged in; just record the marker and stop.
        if (patchFields is not null && patchFields.ContainsKey(BenefitReviewDateKey))
        {
            mergedFields[BenefitReviewManualKey] = JsonSerializer.SerializeToElement(true, JsonOptions);
            return;
        }

        // Never recompute over a hand-set benefit-review date.
        if (IsMarkedManual(mergedFields))
        {
            return;
        }

        // Only (re)compute when this patch set/changed the deploy date and it parses to a real date.
        if (patchFields is null || !patchFields.ContainsKey(DeployDateKey))
        {
            return;
        }

        if (TryReadIsoDate(mergedFields, DeployDateKey, out var deployDate))
        {
            var target = deployDate.AddDays(offsetDays).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            mergedFields[BenefitReviewDateKey] = JsonSerializer.SerializeToElement(target, JsonOptions);
        }
    }

    private static bool IsMarkedManual(IReadOnlyDictionary<string, JsonElement> fields)
    {
        if (!fields.TryGetValue(BenefitReviewManualKey, out var marker))
        {
            return false;
        }

        return marker.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.String => string.Equals(marker.GetString(), "true", StringComparison.OrdinalIgnoreCase),
            _ => false,
        };
    }

    private static bool TryReadIsoDate(IReadOnlyDictionary<string, JsonElement> fields, string key, out DateOnly value)
    {
        value = default;
        var raw = GetString(fields, key);
        return !string.IsNullOrWhiteSpace(raw)
            && DateOnly.TryParseExact(raw, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out value);
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
