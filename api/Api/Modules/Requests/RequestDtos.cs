// Wire contracts for the Requests & Drafts module (Slice 5 — api-contracts.md §3). Property names
// serialize to camelCase (ASP.NET Core web defaults) so they mirror /shared/types/requests.ts and
// /shared/types/drafts.ts exactly; enums travel as strings via JsonStringEnumConverter. Content
// field values ride an open JsonElement map (fields are workspace-configurable via S30). Field
// values and free-text (name/description) are Confidential — never logged (api-pii-handling.md).

using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Text.Json.Serialization;
using McDermott.AiTracker.Api.Modules.Gates;

namespace McDermott.AiTracker.Api.Modules.Requests;

// ─── Responses ────────────────────────────────────────────────────────────────

/// <summary>One stage on a record's lifecycle — the ordered set drives the record-detail stepper (S4).
/// <c>StatusCategory</c> is the stage's dashboard bucket (BS §10.6), surfaced on the S4 Status-tab summary row.</summary>
public sealed record RequestStageRef(string Key, string Label, string StatusCategory);

/// <summary>Hold sub-block on a request (legacy binary derived read — v2 slice 26).</summary>
public sealed record HoldState(bool Held, string? Reason);

/// <summary>Record Status/hold values (close/status cleanup — 'Abandoned' retired). Serializes as string via JsonStringEnumConverter.</summary>
public enum RequestStatusHoldValue
{
    InProgress,
    OnHold,
}

/// <summary>Combined Outcome (delivery | local). Populated by close (later slice); null in slice 5.</summary>
public sealed record OutcomeDto(string Kind, string Value, string Notes, string? DuplicateOfRecordId = null);

/// <summary>Time-in-stage (BS §10.6) — whole days since the record entered its current stage. Mirrors TimeInStage in requests.ts.</summary>
public sealed record TimeInStageDto(string StageKey, int Days);

/// <summary>Escalation summary — present only on escalated records (later slice); null in slice 5.</summary>
public sealed record BridgeBlockDto(
    bool IsEscalated,
    Guid OriginWorkspaceId,
    string OriginWorkspaceName,
    Guid AiWorkspaceId,
    DateTime EscalatedAt,
    string AiSolutionsStatus,
    IReadOnlyList<string> LockedFields);

/// <summary>GET /requests/{id} — the full record (api-contracts.md §3).</summary>
public sealed record RequestDto(
    string Id,
    Guid WorkspaceId,
    string Origin,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    string CreatedBy,
    string UpdatedBy,
    string? LegacyId,
    Guid LifecycleId,
    // The lifecycle's display name — projected for the S4 Status-tab summary row.
    string LifecycleName,
    IReadOnlyList<RequestStageRef> Stages,
    string? Stage,
    // Slice 26 — tri-state Status/hold. Source of truth for the pill + guards.
    RequestStatusHoldValue StatusHold,
    // Slice 26 — free-text note; null on InProgress.
    string? StatusHoldNote,
    HoldState? Hold,
    OutcomeDto? Outcome,
    string DisplayStatus,
    string? SlaStatus,
    TimeInStageDto? TimeInStage,
    string Name,
    string Description,
    IReadOnlyDictionary<string, JsonElement> Fields,
    BridgeBlockDto? Bridge,
    string ETag);

/// <summary>A single row on the Requests list — only the view's columns are projected (BS §22.4).</summary>
public sealed record RequestListRow(
    string Id,
    string ETag,
    IReadOnlyDictionary<string, object?> Columns,
    string? SlaStatus,
    // The S2 row pill (InProgress / OnHold).
    RequestStatusHoldValue StatusHold);

/// <summary>One Request export column — a stored Request field's key + display label, for the CSV
/// export field picker and value projection (field-surfacing sweep). Sourced from the workspace field
/// catalog so it stays in lock-step with the Fields tab.</summary>
public sealed record RequestExportField(string Key, string Label);

/// <summary>An intake similar-requests match (BS §9.8). Mirrors SimilarRequestDto in requests.ts.</summary>
public sealed record SimilarRequestDto(
    string Id,
    string Name,
    string Stage,
    string Origin);

/// <summary>Paginated envelope — mirrors PaginatedResponse&lt;T&gt; in /shared/types/common.ts.</summary>
public sealed record PaginatedResponse<T>(
    IReadOnlyList<T> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>
/// POST /requests/{id}/stage result — a discriminated union on <c>advanced</c>: either the record
/// advanced (with the new stage) or a gate opened (slice 8). Mirrors StageTransitionResult in
/// requests.ts; null members are omitted so each shape matches its union member exactly.
/// </summary>
public sealed record StageTransitionResultDto(
    bool Advanced,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? NewStage = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ApprovalRequestDto? GateOpened = null);

// ─── Request bodies ─────────────────────────────────────────────────────────────

/// <summary>POST /workspaces/{id}/requests.</summary>
public sealed class RequestCreateRequest
{
    [Required]
    [MaxLength(400)]
    public string? Name { get; set; }

    public string? Description { get; set; }

    /// <summary>Content-field values (open map — keys are field keys). Cross-field rules validated server-side.</summary>
    public Dictionary<string, JsonElement>? Fields { get; set; }

    /// <summary>
    /// v2 (slice 27). The lifecycle chosen at the S3 intake "Lifecycle" picker. When null, the
    /// server uses the workspace default. Preferred over the legacy <c>fields.requestType</c>
    /// string (still honoured as a fallback for CSV import). Must resolve to a lifecycle of this
    /// workspace, else the resolver falls through to requestType / default.
    /// </summary>
    public Guid? LifecycleId { get; set; }

    /// <summary>Related-record ids queued during the intake similar-requests nudge — stamped as
    /// <c>related</c> typed links at submission (slice 10).</summary>
    public IReadOnlyList<string>? QueuedRelatedRecordIds { get; set; }

    /// <summary>Kinded link-backs queued by Copy / Promote — stamped as typed links at submission (slice 10).</summary>
    public IReadOnlyList<QueuedLinkInput>? QueuedLinks { get; set; }
}

/// <summary>A queued link-back — mirrors QueuedLink in /shared/types/typed-links.ts.</summary>
public sealed class QueuedLinkInput
{
    public string? ToRecordId { get; set; }

    public string? Kind { get; set; }
}

/// <summary>PATCH /requests/{id}. Sparse — only changed fields are sent.</summary>
public sealed class RequestPatchRequest
{
    [MaxLength(400)]
    public string? Name { get; set; }

    public string? Description { get; set; }

    public Dictionary<string, JsonElement>? Fields { get; set; }

    /// <summary>
    /// Slice 26 — set the record's tri-state Status/hold from the S4 Status tab. When present,
    /// routes through <c>usp_UpsertRequestStatusHold</c> alongside any field patch. Preferred over
    /// the legacy <c>hold</c> shape below.
    /// </summary>
    public RequestStatusHoldValue? StatusHold { get; set; }

    /// <summary>Slice 26 — free-text note. Required client-side when <c>StatusHold != InProgress</c>.</summary>
    [MaxLength(500)]
    public string? StatusHoldNote { get; set; }

    /// <summary>
    /// Legacy binary hold — the API accepts it for one release and maps to statusHold:
    /// <c>held=true → OnHold</c>, <c>held=false → InProgress</c>. Prefer <see cref="StatusHold"/>.
    /// </summary>
    public HoldInput? Hold { get; set; }

    /// <summary>ETag from the last-loaded record (base64 RowVer). The If-Match header takes precedence.</summary>
    public string? IfMatch { get; set; }
}

/// <summary>POST /requests/{id}/stage.</summary>
public sealed class StageTransitionRequest
{
    [Required]
    [MaxLength(64)]
    public string? ToStage { get; set; }
}

/// <summary>POST /requests/{id}/hold.</summary>
public sealed class HoldInput
{
    public bool Held { get; set; }

    [MaxLength(400)]
    public string? Reason { get; set; }
}

/// <summary>POST /workspaces/{id}/requests/query — filter/sort/page payload (mirrors PaginatedQuery).</summary>
public sealed class PaginatedQuery
{
    public int Page { get; set; } = 1;

    public int PageSize { get; set; } = 20;

    /// <summary>Column key → filter clause (the clause's own shape is parsed per its `kind`).</summary>
    public Dictionary<string, JsonElement>? Filters { get; set; }

    public IReadOnlyList<SortSpec>? Sort { get; set; }

    public Guid? SavedViewId { get; set; }
}

/// <summary>One sort directive — column key + direction.</summary>
public sealed class SortSpec
{
    public string? Column { get; set; }

    public string? Direction { get; set; }
}

// ─── Drafts (owner-scoped pre-record state — /shared/types/drafts.ts) ─────────────

/// <summary>The prefilled body of a draft.</summary>
public sealed record DraftBodyDto(
    IReadOnlyDictionary<string, JsonElement> Fields,
    IReadOnlyList<string>? Related,
    IReadOnlyList<QueuedLinkDto>? QueuedLinks = null);

/// <summary>A kinded link-back queued on a draft — mirrors QueuedLink in /shared/types/typed-links.ts.</summary>
public sealed record QueuedLinkDto(string ToRecordId, string Kind);

/// <summary>A saved draft.</summary>
public sealed record DraftDto(
    Guid Id,
    Guid WorkspaceId,
    string ObjectType,
    string? Title,
    DraftBodyDto Body,
    DateTime LastEditedAt);

/// <summary>A row on the drafts list (S26).</summary>
public sealed record DraftListRow(
    Guid Id,
    string? Title,
    string ObjectType,
    DateTime LastEditedAt);

/// <summary>POST /workspaces/{id}/drafts — create (omit id) or update (include id) a personal draft.</summary>
public sealed class DraftSaveRequest
{
    /// <summary>Omit to mint a new draft; include to update the caller's own draft.</summary>
    public Guid? Id { get; set; }

    [Required]
    [RegularExpression("^(Request|Task|Feature|Toolkit|Announcement)$")]
    public string? ObjectType { get; set; }

    [MaxLength(400)]
    public string? Title { get; set; }

    [Required]
    public DraftBodyInput? Body { get; set; }
}

/// <summary>Inbound draft body.</summary>
public sealed class DraftBodyInput
{
    public Dictionary<string, JsonElement>? Fields { get; set; }

    public IReadOnlyList<string>? Related { get; set; }

    /// <summary>Kinded link-backs queued by Copy / Promote (slice 10).</summary>
    public IReadOnlyList<QueuedLinkInput>? QueuedLinks { get; set; }
}
