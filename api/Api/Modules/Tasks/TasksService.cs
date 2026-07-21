// Tasks service (Slice 7 — api-contracts.md §5). Owns the tasks section of the Tasks & gates tab:
// create single tasks / apply bundle templates, patch (check-off, notes, typed-field value),
// list, and read the bundle-template catalogue. Access is gated through the parent Request on the
// caller's side (usp_GetRequestByIdForUser) — a forbidden OR non-existent record both resolve to
// null → 403, never 404 (BS §22.6); the stored procedures re-gate as defence in depth. Task titles,
// notes, and field values are Confidential — never logged; event payloads carry ids only
// (api-pii-handling.md). Every state change emits exactly one event on the spine.

using System.Data;
using System.Globalization;
using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Modules.TypedLinks;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Tasks;

/// <summary>Outcome of a create — the controller maps it to 201 / 403 / 400.</summary>
public enum TaskCreateOutcome
{
    Created,
    Forbidden,
    Invalid,
}

/// <summary>Outcome of a promote-to-request — the controller maps it to 201 / 403.</summary>
public enum PromoteOutcome
{
    Created,
    /// <summary>The task is not visible to the caller (403, never disclose existence).</summary>
    NotFound,
    /// <summary>The caller cannot create a record in the target workspace (403).</summary>
    Denied,
}

public sealed record PromoteResult(PromoteOutcome Outcome, Guid? DraftId = null);

/// <summary>Create result: tasks on success, or an outcome + validation errors otherwise.</summary>
public sealed record TaskCreateResult(
    TaskCreateOutcome Outcome,
    IReadOnlyList<TaskDto> Tasks,
    IReadOnlyDictionary<string, string[]>? Errors);

/// <summary>Outcome of a task patch — the controller maps it to 200 / 403 / 409.</summary>
public enum TaskPatchOutcome
{
    Success,
    /// <summary>Task not visible to the caller — 403, never disclose existence.</summary>
    Denied,
    /// <summary>Slice 26 — parent record is <c>OnHold</c> or <c>Abandoned</c>. 409 record-on-hold.</summary>
    RecordOnHold,
}

public sealed record TaskPatchResult(TaskPatchOutcome Outcome, TaskDto? Task = null);

public interface ITasksService
{
    /// <summary>List a record's tasks. Returns null when the caller cannot see the record (→ 403).</summary>
    Task<IReadOnlyList<TaskDto>?> GetTasksAsync(string recordId, Guid userId, CancellationToken cancellationToken);

    /// <summary>Create a single task or apply a bundle template.</summary>
    Task<TaskCreateResult> CreateAsync(
        string recordId, TaskCreateRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    /// <summary>
    /// Patch a task. Result outcomes: <c>Success</c> (200 with task), <c>Denied</c> (403 — invisible
    /// or missing), <c>RecordOnHold</c> (slice 26 — parent record is OnHold/Abandoned and the change
    /// would complete the task; 409 record-on-hold).
    /// </summary>
    Task<TaskPatchResult> PatchAsync(
        Guid taskId, TaskPatchRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    /// <summary>The workspace's bundle templates for the composer's "Add bundle" picker.</summary>
    Task<IReadOnlyList<TaskBundleTemplateDto>> GetBundlesAsync(Guid workspaceId, CancellationToken cancellationToken);

    /// <summary>Promote a task to its own Request (BS §5) — copies the parent to a fresh draft with a
    /// queued <c>related</c> link back and cancels the task. Returns the new draft id.</summary>
    Task<PromoteResult> PromoteToRequestAsync(
        Guid taskId, Guid actorUserId, string operationId, CancellationToken cancellationToken);
}

public sealed class TasksService : ITasksService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly IEventSpine _eventSpine;
    private readonly IClock _clock;
    private readonly ICopyService _copy;

    public TasksService(AppDbContext db, IEventSpine eventSpine, IClock clock, ICopyService copy)
    {
        _db = db;
        _eventSpine = eventSpine;
        _clock = clock;
        _copy = copy;
    }

    public async Task<IReadOnlyList<TaskDto>?> GetTasksAsync(
        string recordId, Guid userId, CancellationToken cancellationToken)
    {
        // Gate first so a forbidden record is a 403, not an empty 200 (BS §22.6). An accessible
        // record with no tasks still returns [].
        var record = await ReadRecordAsync(recordId, userId, cancellationToken).ConfigureAwait(false);
        if (record is null)
        {
            return null;
        }

        var rows = await _db.Set<TaskRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetTasksForRequest @RecordId, @UserId",
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return rows.Select(MapTask).ToList();
    }

    public async Task<TaskCreateResult> CreateAsync(
        string recordId, TaskCreateRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var record = await ReadRecordAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (record is null)
        {
            return new TaskCreateResult(TaskCreateOutcome.Forbidden, Array.Empty<TaskDto>(), null);
        }

        return string.Equals(request.Kind, "bundle", StringComparison.Ordinal)
            ? await ApplyBundleAsync(record, request, actorUserId, operationId, cancellationToken).ConfigureAwait(false)
            : await CreateSingleAsync(record, request, actorUserId, operationId, cancellationToken).ConfigureAwait(false);
    }

    public async Task<TaskPatchResult> PatchAsync(
        Guid taskId, TaskPatchRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var (valueParams, _) = ExtractFieldValue(request.TypedField?.Value);
        var setTypedFieldValue = request.TypedField is not null;

        List<TaskRow> rows;
        try
        {
            rows = await _db.Set<TaskRow>()
                .FromSqlRaw(
                    "EXEC dbo.usp_PatchTask @TaskId, @UserId, @SetTitle, @Title, @SetPhase, @Phase, " +
                    "@SetAssignee, @AssigneeUserId, @SetStatus, @Status, @SetNotes, @Notes, " +
                    "@SetTypedFieldValue, @FieldValueUrl, @FieldValueText, @FieldValueNumber, " +
                    "@FieldValueDate, @FieldValueSelect, @FieldValueBool",
                    new SqlParameter("@TaskId", taskId),
                    new SqlParameter("@UserId", actorUserId),
                    new SqlParameter("@SetTitle", request.Title is not null),
                    new SqlParameter("@Title", (object?)request.Title ?? DBNull.Value),
                    new SqlParameter("@SetPhase", request.Phase is not null),
                    new SqlParameter("@Phase", (object?)request.Phase ?? DBNull.Value),
                    new SqlParameter("@SetAssignee", request.Assignee is not null),
                    new SqlParameter("@AssigneeUserId", (object?)request.Assignee ?? DBNull.Value),
                    new SqlParameter("@SetStatus", request.Status is not null),
                    new SqlParameter("@Status", (object?)request.Status ?? DBNull.Value),
                    new SqlParameter("@SetNotes", request.Notes is not null),
                    new SqlParameter("@Notes", (object?)request.Notes ?? DBNull.Value),
                    new SqlParameter("@SetTypedFieldValue", setTypedFieldValue),
                    valueParams.Url,
                    valueParams.Text,
                    valueParams.Number,
                    valueParams.Date,
                    valueParams.Select,
                    valueParams.Bool)
                .ToListAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == RequestsService.RecordOnHoldError)
        {
            // Slice 26 — parent record is OnHold / Abandoned, task Status→Done blocked (D3 scope).
            return new TaskPatchResult(TaskPatchOutcome.RecordOnHold);
        }

        var row = rows.FirstOrDefault();
        if (row is null)
        {
            return new TaskPatchResult(TaskPatchOutcome.Denied);
        }

        await EmitAsync("task.updated", row.WorkspaceId, row.RecordId, actorUserId,
            new { taskId = row.TaskId }, operationId, cancellationToken).ConfigureAwait(false);

        return new TaskPatchResult(TaskPatchOutcome.Success, MapTask(row));
    }

    public async Task<IReadOnlyList<TaskBundleTemplateDto>> GetBundlesAsync(
        Guid workspaceId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<TaskBundleTemplateRow>()
            .FromSqlRaw("EXEC dbo.usp_GetTaskBundleTemplates @WorkspaceId", new SqlParameter("@WorkspaceId", workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return rows.Select(row => new TaskBundleTemplateDto(row.TaskBundleTemplateId, row.Name, ParseBundleTasks(row.TasksJson))).ToList();
    }

    public async Task<PromoteResult> PromoteToRequestAsync(
        Guid taskId, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        // Gate on the task (access baked into usp_GetTaskById) — null → 403, never disclose existence.
        var task = await ReadTaskAsync(taskId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (task is null)
        {
            return new PromoteResult(PromoteOutcome.NotFound);
        }

        // Copy the parent record to a fresh draft in the same workspace, queuing a `related` link
        // back to the parent. CopyService re-checks the caller can create there (Member+). Copy first,
        // then cancel — so a denied/failed copy never leaves the task cancelled with no draft.
        var copy = await _copy.CopyAsync(
            task.RecordId,
            new CopyRequest { TargetWorkspaceId = task.WorkspaceId, IncludeAttachments = false, LinkBackKind = "related" },
            actorUserId,
            cancellationToken).ConfigureAwait(false);

        if (copy.Outcome != CopyOutcome.Success)
        {
            return new PromoteResult(copy.Outcome == CopyOutcome.DeniedTarget ? PromoteOutcome.Denied : PromoteOutcome.NotFound);
        }

        // Cancel the source task (its own PatchAsync emits task.updated).
        await PatchAsync(taskId, new TaskPatchRequest { Status = "Cancelled" }, actorUserId, operationId, cancellationToken)
            .ConfigureAwait(false);

        return new PromoteResult(PromoteOutcome.Created, copy.DraftId);
    }

    private async Task<TaskRow?> ReadTaskAsync(Guid taskId, Guid userId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<TaskRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetTaskById @TaskId, @UserId",
                new SqlParameter("@TaskId", taskId),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return rows.FirstOrDefault();
    }

    // ─── Create paths ──────────────────────────────────────────────────────────

    private async Task<TaskCreateResult> CreateSingleAsync(
        RequestRow record, TaskCreateRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
        {
            return Invalid("title", "A task needs a title.");
        }

        var phase = NormalisePhase(request.Phase);
        Guid? fieldDefinitionId = null;
        string? fieldLabel = null;
        string? fieldType = null;
        FieldValueParams values = FieldValueParams.Empty();

        if (request.TypedField is not null)
        {
            var resolved = await ResolveTypedFieldAsync(record.WorkspaceId, request.TypedField, cancellationToken)
                .ConfigureAwait(false);
            if (resolved.Error is not null)
            {
                return Invalid("typedField", resolved.Error);
            }

            fieldDefinitionId = request.TypedField.DefinitionId;
            fieldLabel = resolved.Label;
            fieldType = resolved.Kind;
            values = resolved.Values;
        }

        // Default the assignee to the creator so "assigned to you" works (matches the prototype chip).
        var assignee = request.Assignee ?? actorUserId;

        var rows = await _db.Set<TaskRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_CreateTask @RecordId, @WorkspaceId, @Author, @Title, @Phase, @AssigneeUserId, " +
                "@FieldDefinitionId, @FieldLabel, @FieldType, @FieldValueUrl, @FieldValueText, " +
                "@FieldValueNumber, @FieldValueDate, @FieldValueSelect, @FieldValueBool",
                new SqlParameter("@RecordId", record.RecordId),
                new SqlParameter("@WorkspaceId", record.WorkspaceId),
                new SqlParameter("@Author", actorUserId),
                new SqlParameter("@Title", request.Title.Trim()),
                new SqlParameter("@Phase", phase),
                new SqlParameter("@AssigneeUserId", assignee),
                new SqlParameter("@FieldDefinitionId", (object?)fieldDefinitionId ?? DBNull.Value),
                new SqlParameter("@FieldLabel", (object?)fieldLabel ?? DBNull.Value),
                new SqlParameter("@FieldType", (object?)fieldType ?? DBNull.Value),
                values.Url,
                values.Text,
                values.Number,
                values.Date,
                values.Select,
                values.Bool)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var row = rows.FirstOrDefault();
        if (row is null)
        {
            // The proc's own gate denied the write (should not happen after ReadRecordAsync succeeded).
            return new TaskCreateResult(TaskCreateOutcome.Forbidden, Array.Empty<TaskDto>(), null);
        }

        await EmitAsync("task.created", row.WorkspaceId, row.RecordId, actorUserId,
            new { taskId = row.TaskId }, operationId, cancellationToken).ConfigureAwait(false);

        return new TaskCreateResult(TaskCreateOutcome.Created, new[] { MapTask(row) }, null);
    }

    private async Task<TaskCreateResult> ApplyBundleAsync(
        RequestRow record, TaskCreateRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        if (request.BundleTemplateId is not { } bundleId)
        {
            return Invalid("bundleTemplateId", "Choose a task bundle template to apply.");
        }

        var rows = await _db.Set<TaskRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_ApplyTaskBundle @RecordId, @WorkspaceId, @Author, @BundleTemplateId",
                new SqlParameter("@RecordId", record.RecordId),
                new SqlParameter("@WorkspaceId", record.WorkspaceId),
                new SqlParameter("@Author", actorUserId),
                new SqlParameter("@BundleTemplateId", bundleId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        if (rows.Count == 0)
        {
            // Record was accessible (gated above) but the bundle produced nothing → unknown template.
            return Invalid("bundleTemplateId", "That task bundle could not be found.");
        }

        await EmitAsync("task.bundle-applied", record.WorkspaceId, record.RecordId, actorUserId,
            new { bundleTemplateId = bundleId, count = rows.Count }, operationId, cancellationToken).ConfigureAwait(false);

        return new TaskCreateResult(TaskCreateOutcome.Created, rows.Select(MapTask).ToList(), null);
    }

    // ─── Typed-field resolution + value extraction ───────────────────────────────

    private sealed record ResolvedTypedField(string? Error, string? Label, string? Kind, FieldValueParams Values);

    /// <summary>
    /// Validate that the captured field belongs to the workspace's task library and that the value's
    /// kind matches the field's type; resolve the label. Never trusts client-supplied field metadata.
    /// </summary>
    private async Task<ResolvedTypedField> ResolveTypedFieldAsync(
        Guid workspaceId, TaskTypedFieldInput input, CancellationToken cancellationToken)
    {
        if (input.Value is null || string.IsNullOrWhiteSpace(input.Value.Kind))
        {
            return new ResolvedTypedField("Add a value for the captured field.", null, null, FieldValueParams.Empty());
        }

        var fieldRows = await _db.Set<TaskFieldRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetTaskField @WorkspaceId, @FieldDefinitionId",
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@FieldDefinitionId", input.DefinitionId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var field = fieldRows.FirstOrDefault();
        if (field is null)
        {
            return new ResolvedTypedField("That field is not in this workspace's task-field library.", null, null, FieldValueParams.Empty());
        }

        var expectedKind = MapDefinitionTypeToKind(field.FieldType);
        if (expectedKind is null || !string.Equals(expectedKind, input.Value.Kind, StringComparison.Ordinal))
        {
            return new ResolvedTypedField("The captured value doesn't match the field's type.", null, null, FieldValueParams.Empty());
        }

        var (values, valueError) = ExtractFieldValue(input.Value);
        if (valueError is not null)
        {
            return new ResolvedTypedField(valueError, null, null, FieldValueParams.Empty());
        }

        return new ResolvedTypedField(null, field.DisplayName, input.Value.Kind, values);
    }

    /// <summary>Six SqlParameters, exactly one non-null, chosen by the value's kind.</summary>
    private static (FieldValueParams Params, string? Error) ExtractFieldValue(TaskTypedFieldValueDto? value)
    {
        var result = FieldValueParams.Empty();
        if (value is null)
        {
            return (result, null);
        }

        // An empty value is allowed on every kind — it means "field captured, no value yet" (the
        // prototype attaches a field on create, then fills the value inline). Empty → null column.
        switch (value.Kind)
        {
            case "url":
                result.Url.Value = EmptyToNull(value.Url);
                break;
            case "text":
                result.Text.Value = EmptyToNull(value.Text);
                break;
            case "number":
                result.Number.Value = (object?)value.Number ?? DBNull.Value;
                break;
            case "date":
                // Bind as DateTime (midnight) for the SqlDbType.Date param — portable across SqlClient versions.
                result.Date.Value = TryParseIsoDate(value.Date, out var date)
                    ? date.ToDateTime(TimeOnly.MinValue)
                    : DBNull.Value;
                break;
            case "select":
                result.Select.Value = EmptyToNull(value.SelectedOption);
                break;
            case "checkbox":
                result.Bool.Value = value.Checked ?? false;
                break;
            default:
                return (result, "Unsupported field type.");
        }

        return (result, null);
    }

    // ─── Mapping ───────────────────────────────────────────────────────────────

    private static TaskDto MapTask(TaskRow row) => new(
        Id: row.TaskId,
        ParentRequestId: row.RecordId,
        Title: row.Title,
        Phase: row.Phase,
        Assignee: row.AssigneeUserId,
        Status: row.Status,
        TypedField: MapTypedField(row),
        Notes: row.Notes,
        CompletedAt: row.CompletedAt is null ? null : DateTime.SpecifyKind(row.CompletedAt.Value, DateTimeKind.Utc),
        CreatedAt: DateTime.SpecifyKind(row.CreatedAt, DateTimeKind.Utc));

    private static TaskTypedFieldDto? MapTypedField(TaskRow row)
    {
        if (row.FieldDefinitionId is not { } definitionId || string.IsNullOrEmpty(row.FieldType))
        {
            return null;
        }

        var value = new TaskTypedFieldValueDto { Kind = row.FieldType };
        switch (row.FieldType)
        {
            case "url":
                value.Url = row.FieldValueUrl;
                break;
            case "text":
                value.Text = row.FieldValueText;
                break;
            case "number":
                value.Number = row.FieldValueNumber;
                break;
            case "date":
                value.Date = row.FieldValueDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                break;
            case "select":
                value.SelectedOption = row.FieldValueSelect;
                break;
            case "checkbox":
                value.Checked = row.FieldValueBool ?? false;
                break;
            default:
                return null;
        }

        return new TaskTypedFieldDto(definitionId, row.FieldLabel ?? string.Empty, value);
    }

    public static IReadOnlyList<TaskBundleTemplateTaskDto> ParseBundleTasks(string? tasksJson)
    {
        if (string.IsNullOrWhiteSpace(tasksJson))
        {
            return Array.Empty<TaskBundleTemplateTaskDto>();
        }

        try
        {
            var entries = JsonSerializer.Deserialize<List<BundleTaskEntry>>(tasksJson, JsonOptions) ?? new List<BundleTaskEntry>();
            return entries
                .Where(entry => !string.IsNullOrWhiteSpace(entry.Title))
                .Select(entry => new TaskBundleTemplateTaskDto(entry.Title!, NormalisePhase(entry.Phase)))
                .ToList();
        }
        catch (JsonException)
        {
            return Array.Empty<TaskBundleTemplateTaskDto>();
        }
    }

    private sealed class BundleTaskEntry
    {
        public string? Title { get; set; }
        public string? Phase { get; set; }
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    private async Task<RequestRow?> ReadRecordAsync(string recordId, Guid userId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<RequestRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetRequestByIdForUser @RecordId, @UserId",
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return rows.FirstOrDefault();
    }

    private static TaskCreateResult Invalid(string field, string message) =>
        new(TaskCreateOutcome.Invalid, Array.Empty<TaskDto>(),
            new Dictionary<string, string[]>(StringComparer.Ordinal) { [field] = new[] { message } });

    private static readonly IReadOnlySet<string> KnownPhases = new HashSet<string>(StringComparer.Ordinal)
    {
        "Intake", "Triage", "Execution", "Validation", "Delivery", "Stabilization", "Closure", "Unphased",
    };

    /// <summary>Coerce a phase to a known value; anything unrecognised falls to 'Unphased'.</summary>
    public static string NormalisePhase(string? phase) =>
        !string.IsNullOrWhiteSpace(phase) && KnownPhases.Contains(phase) ? phase : "Unphased";

    /// <summary>FieldDefinition type (S30 vocabulary) → the wire value-kind.</summary>
    public static string? MapDefinitionTypeToKind(string fieldType) => fieldType switch
    {
        "Url" => "url",
        "Text" => "text",
        "Number" => "number",
        "Date" => "date",
        "SingleSelect" => "select",
        "Boolean" => "checkbox",
        _ => null,
    };

    private static object EmptyToNull(string? value) =>
        string.IsNullOrEmpty(value) ? DBNull.Value : value;

    private static bool TryParseIsoDate(string? raw, out DateOnly date)
    {
        date = default;
        return !string.IsNullOrWhiteSpace(raw)
            && DateOnly.TryParseExact(raw, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);
    }

    private async Task EmitAsync(
        string eventType, Guid workspaceId, string recordId, Guid actorUserId, object payloadObject, string operationId, CancellationToken cancellationToken)
    {
        var payload = JsonSerializer.Serialize(payloadObject, JsonOptions);
        var envelope = new EventEnvelope(
            Guid.NewGuid(), eventType, workspaceId, recordId, actorUserId, _clock.UtcNow, payload, operationId);
        await _eventSpine.EmitAsync(envelope, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>Holds the six typed-field value SqlParameters; exactly one is set per value kind.</summary>
    private sealed class FieldValueParams
    {
        public required SqlParameter Url { get; init; }
        public required SqlParameter Text { get; init; }
        public required SqlParameter Number { get; init; }
        public required SqlParameter Date { get; init; }
        public required SqlParameter Select { get; init; }
        public required SqlParameter Bool { get; init; }

        public static FieldValueParams Empty() => new()
        {
            Url = new SqlParameter("@FieldValueUrl", SqlDbType.NVarChar, 2048) { Value = DBNull.Value },
            Text = new SqlParameter("@FieldValueText", SqlDbType.NVarChar, -1) { Value = DBNull.Value },
            Number = new SqlParameter("@FieldValueNumber", SqlDbType.Decimal) { Precision = 18, Scale = 4, Value = DBNull.Value },
            Date = new SqlParameter("@FieldValueDate", SqlDbType.Date) { Value = DBNull.Value },
            Select = new SqlParameter("@FieldValueSelect", SqlDbType.NVarChar, 200) { Value = DBNull.Value },
            Bool = new SqlParameter("@FieldValueBool", SqlDbType.Bit) { Value = DBNull.Value },
        };
    }
}
