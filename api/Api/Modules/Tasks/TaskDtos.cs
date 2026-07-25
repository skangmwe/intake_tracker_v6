// Wire contracts for the Tasks module (Slice 7 — api-contracts.md §5). Property names serialize to
// camelCase (ASP.NET Core web defaults) so they mirror /shared/types/tasks.ts exactly; enums travel
// as strings. Task titles / notes are Confidential — never logged (api-pii-handling.md).

using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace McDermott.AiTracker.Api.Modules.Tasks;

// ─── Responses ────────────────────────────────────────────────────────────────

/// <summary>
/// A type-aware structured field value on a Task. Mirrors the TaskTypedFieldValue union in
/// tasks.ts — Kind selects which single value property is set; the others serialize away.
/// </summary>
public sealed class TaskTypedFieldValueDto
{
    /// <summary>'url' | 'text' | 'number' | 'date' | 'select' | 'checkbox'.</summary>
    public string Kind { get; set; } = string.Empty;

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Url { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Text { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public decimal? Number { get; set; }

    /// <summary>ISO date (yyyy-MM-dd) for the 'date' kind.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Date { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? SelectedOption { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? Checked { get; set; }
}

/// <summary>The structured typed field a Task captured (mirrors TaskTypedField in tasks.ts).</summary>
public sealed record TaskTypedFieldDto(Guid DefinitionId, string Label, TaskTypedFieldValueDto Value);

/// <summary>A single Task (mirrors TaskDto in tasks.ts). Completed tasks carry CompletedAt; DueDate is
/// an optional planning date (ISO yyyy-MM-dd).</summary>
public sealed record TaskDto(
    Guid Id,
    string ParentRequestId,
    string Title,
    string Phase,
    Guid? Assignee,
    string Status,
    TaskTypedFieldDto? TypedField,
    string? Notes,
    DateTime? CompletedAt,
    string? DueDate,
    DateTime CreatedAt);

/// <summary>A task-bundle template for the composer's "Add bundle" picker (mirrors TaskBundleTemplate).</summary>
public sealed record TaskBundleTemplateDto(Guid Id, string Name, IReadOnlyList<TaskBundleTemplateTaskDto> Tasks);

/// <summary>POST /tasks/{id}/promote-to-request result — the new draft's id (mirrors PromoteToRequestResult).</summary>
public sealed record PromoteToRequestResultDto(Guid DraftId);

/// <summary>One task entry inside a bundle template.</summary>
public sealed record TaskBundleTemplateTaskDto(string Title, string Phase);

// ─── Request bodies ─────────────────────────────────────────────────────────────

/// <summary>The typed field on a create/patch request — no label (resolved server-side from the schema).</summary>
public sealed class TaskTypedFieldInput
{
    [Required]
    public Guid DefinitionId { get; set; }

    [Required]
    public TaskTypedFieldValueDto? Value { get; set; }
}

/// <summary>
/// POST /requests/{id}/tasks — a single task or a bundle apply, discriminated by Kind
/// ('single' | 'bundle'), mirroring the TaskCreateRequest union in tasks.ts.
/// </summary>
public sealed class TaskCreateRequest
{
    [Required]
    public string? Kind { get; set; }

    // kind == 'single'
    [MaxLength(400)]
    public string? Title { get; set; }

    public string? Phase { get; set; }

    public Guid? Assignee { get; set; }

    /// <summary>Optional planning date (ISO yyyy-MM-dd). Omitted / null → no due date.</summary>
    public string? DueDate { get; set; }

    public TaskTypedFieldInput? TypedField { get; set; }

    // kind == 'bundle'
    public Guid? BundleTemplateId { get; set; }
}

/// <summary>PATCH /tasks/{id} — sparse. Present properties are applied; omitted ones are unchanged.</summary>
public sealed class TaskPatchRequest
{
    [MaxLength(400)]
    public string? Title { get; set; }

    public string? Phase { get; set; }

    public Guid? Assignee { get; set; }

    /// <summary>'Open' | 'Done' | 'Cancelled' | 'Locked'.</summary>
    public string? Status { get; set; }

    public string? Notes { get; set; }

    /// <summary>
    /// Sparse due-date edit: present (an ISO yyyy-MM-dd string) → set it; present-but-empty ("") →
    /// clear it; omitted (null) → leave it unchanged.
    /// </summary>
    public string? DueDate { get; set; }

    /// <summary>Present → set the captured field's value; absent (null) → leave it unchanged.</summary>
    public TaskTypedFieldInput? TypedField { get; set; }
}
