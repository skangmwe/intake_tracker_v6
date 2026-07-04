// EF Core entity types for the Slice 1 foundation schema. POCOs only — mapped to
// the hand-written SQL migrations under database/migrations/. Column types,
// constraints, and indexes are owned by the migrations (single source of truth);
// this file mirrors the shape EF reads/writes for single-table CRUD (api-data-access.md).

namespace McDermott.AiTracker.Api.Data;

/// <summary>Marker for entities that participate in the soft-delete global query filter.</summary>
public interface ISoftDeletable
{
    bool IsDeleted { get; }
}

/// <summary>The six audit columns every table carries (database-coding-standards.md).</summary>
public abstract class AuditableEntity : ISoftDeletable
{
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
}

/// <summary>A PG/Dept workspace or the central AI Solutions workspace.</summary>
public sealed class Workspace : AuditableEntity
{
    public Guid WorkspaceId { get; set; }
    public string Name { get; set; } = string.Empty;
    /// <summary>'ai-solutions' | 'pg-dept' | 'pg-dept-template'.</summary>
    public string Kind { get; set; } = string.Empty;
    public string Prefix { get; set; } = string.Empty;
    /// <summary>Monotonic mint counter; first minted record is PREFIX-00000001.</summary>
    public long NextSequence { get; set; }
    public DateTime? RetiredAt { get; set; }
}

/// <summary>A user — provisioned by EnsureUserMiddleware on first authenticated request.</summary>
public sealed class User : AuditableEntity
{
    /// <summary>The Entra `oid` claim — the only user identifier permitted in logs.</summary>
    public Guid UserId { get; set; }
    /// <summary>PII (Always-Encrypted in prod). Never logged.</summary>
    public string DisplayName { get; set; } = string.Empty;
    /// <summary>PII (Always-Encrypted in prod). Never logged.</summary>
    public string Email { get; set; } = string.Empty;
    public DateTime LastSignInAt { get; set; }
    public bool IsDisabled { get; set; }
    /// <summary>Server-persisted UI theme preference ('light' | 'dark'). Roams across devices.</summary>
    public string Theme { get; set; } = "light";
}

/// <summary>
/// Keyless projection of a caller's workspace memberships joined to their workspace
/// (name/kind/prefix). Populated by <c>usp_GetUserWorkspaces</c> — the join takes it out
/// of single-table CRUD (api-data-access.md), so it is read through a stored procedure.
/// </summary>
public sealed class UserWorkspaceRow
{
    public Guid WorkspaceId { get; set; }
    public string WorkspaceName { get; set; } = string.Empty;
    public string WorkspaceKind { get; set; } = string.Empty;
    public string WorkspacePrefix { get; set; } = string.Empty;
    public string Level { get; set; } = string.Empty;
    public bool IsDashboardViewer { get; set; }
    public Guid? BoundDashboardId { get; set; }
}

/// <summary>A user's access level within a single workspace.</summary>
public sealed class WorkspaceMembership : AuditableEntity
{
    public Guid MembershipId { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid UserId { get; set; }
    /// <summary>'Viewer' | 'Member' | 'WorkspaceAdmin'.</summary>
    public string Level { get; set; } = string.Empty;
    public bool IsDashboardViewer { get; set; }
    public Guid? BoundDashboardId { get; set; }
}

/// <summary>Immutable historical map of workspace prefix -> workspace (PK = Prefix).</summary>
public sealed class PrefixRegistry : AuditableEntity
{
    public string Prefix { get; set; } = string.Empty;
    public Guid WorkspaceId { get; set; }
    public string WorkspaceNameAtMint { get; set; } = string.Empty;
}

/// <summary>Platform-scope field catalog (system fields, Legacy ID, AI Solutions Status).</summary>
public sealed class PlatformField : AuditableEntity
{
    public Guid PlatformFieldId { get; set; }
    public string FieldKey { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string FieldType { get; set; } = string.Empty;
    /// <summary>'System' | 'Platform' | 'Derived'.</summary>
    public string Category { get; set; } = string.Empty;
    public bool IsSystemImmutable { get; set; }
    /// <summary>False for AI Solutions Status — no manual write path anywhere (BS §6.4).</summary>
    public bool HasManualWritePath { get; set; }
    public string? SelectOptionsJson { get; set; }
}

/// <summary>The additive firm-wide Platform admin grant (single source of truth).</summary>
public sealed class PlatformAdminGrant : AuditableEntity
{
    public Guid GrantId { get; set; }
    public Guid UserId { get; set; }
    public DateTime GrantedAt { get; set; }
}

/// <summary>A per-workspace named user group (e.g. the seeded AI Intake group).</summary>
public sealed class UserGroup : AuditableEntity
{
    public Guid UserGroupId { get; set; }
    public Guid WorkspaceId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string GroupKey { get; set; } = string.Empty;
}

/// <summary>A user's membership in a user group.</summary>
public sealed class UserGroupMembership : AuditableEntity
{
    public Guid UserGroupMembershipId { get; set; }
    public Guid UserGroupId { get; set; }
    public Guid UserId { get; set; }
}

/// <summary>Append-only audit row (writes only via usp_EmitAuditEntry; UPDATE/DELETE rejected).</summary>
public sealed class AuditEntry : AuditableEntity
{
    public Guid AuditId { get; set; }
    public Guid WorkspaceId { get; set; }
    public string? RecordId { get; set; }
    public string? ObjectType { get; set; }
    public string EventType { get; set; } = string.Empty;
    public Guid? ActorUserId { get; set; }
    public DateTime EventAt { get; set; }
    public string EventPayload { get; set; } = string.Empty;
}

// ─── Slice 3 (Fields & objects) — keyless read projections ─────────────────────────────
// The five field-schema tables (FieldDefinition / SelectOption / FieldRule / DerivedField /
// FieldRuleDependency) are read via stored procedures (joins → api-data-access.md) and written via
// usp_UpsertFieldDefinition / usp_RetireFieldDefinition. The API therefore never tracks them as EF
// entities — only these keyless projections bound through FromSqlRaw.

/// <summary>One field row from usp_GetWorkspaceFields (DerivedField header folded in).</summary>
public sealed class FieldDefinitionRow
{
    public Guid FieldDefinitionId { get; set; }
    public Guid WorkspaceId { get; set; }
    public string ObjectType { get; set; } = string.Empty;
    public string FieldKey { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string FieldType { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string? Section { get; set; }
    public string? HelpText { get; set; }
    public bool IsRequired { get; set; }
    public bool IsReadOnly { get; set; }
    public bool IsPlatformDefined { get; set; }
    public string? PlatformFieldKey { get; set; }
    public string? VisibleStagesJson { get; set; }
    public string? CrossingToFieldKey { get; set; }
    public decimal? MinValue { get; set; }
    public decimal? MaxValue { get; set; }
    public bool AllowNewValues { get; set; }
    public int SortOrder { get; set; }
    public bool IsRetired { get; set; }
    public string? DerivedKind { get; set; }
    public string? DerivedExpression { get; set; }
    public string? DerivedDefaultValue { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>One option row from usp_GetWorkspaceFieldOptions, keyed by its field.</summary>
public sealed class FieldOptionRow
{
    public string FieldKey { get; set; } = string.Empty;
    public Guid SelectOptionId { get; set; }
    public string OptionValue { get; set; } = string.Empty;
    public string OptionLabel { get; set; } = string.Empty;
    public int SortOrder { get; set; }
}

/// <summary>One rule row from usp_GetWorkspaceFieldRules, keyed by its target field.</summary>
public sealed class FieldRuleRow
{
    public string FieldKey { get; set; } = string.Empty;
    public Guid FieldRuleId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string WhenFieldKey { get; set; } = string.Empty;
    public string Comparator { get; set; } = string.Empty;
    public string? CompareValue { get; set; }
    public string? ProduceValue { get; set; }
    public int SortOrder { get; set; }
}

/// <summary>One dependency edge from usp_GetWorkspaceFieldDependencies.</summary>
public sealed class FieldDependencyRow
{
    public string FromFieldKey { get; set; } = string.Empty;
    public string ToFieldKey { get; set; } = string.Empty;
}

/// <summary>One platform-field row from usp_GetPlatformFields (S34 read-only band).</summary>
public sealed class PlatformFieldRow
{
    public Guid PlatformFieldId { get; set; }
    public string FieldKey { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string FieldType { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public bool IsSystemImmutable { get; set; }
    public bool HasManualWritePath { get; set; }
    public string? SelectOptionsJson { get; set; }
}

// ─── Slice 4 (Lifecycle & gates) — keyless read projections ────────────────────────────
// The lifecycle config tables (Lifecycle / StageDefinition / GateDefinition / GateApproverSlot /
// ApproverTeamMembership / RoleLabelCatalog) are read via stored procedures (joins / live counts →
// api-data-access.md) and written via usp_SaveLifecycleConfig / usp_*ApproverTeamMember. The API
// tracks none of them as EF entities — only these keyless projections bound through FromSqlRaw.

/// <summary>One lifecycle row from usp_GetWorkspaceLifecycles.</summary>
public sealed class LifecycleRow
{
    public Guid LifecycleId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string RequestType { get; set; } = string.Empty;
    public bool IsDefault { get; set; }
    public int SortOrder { get; set; }
}

/// <summary>One stage row from usp_GetWorkspaceStages, keyed by its lifecycle.</summary>
public sealed class StageDefinitionRow
{
    public Guid StageDefinitionId { get; set; }
    public Guid LifecycleId { get; set; }
    public string StageKey { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string StatusCategory { get; set; } = string.Empty;
    public int SortOrder { get; set; }
}

/// <summary>One gate row from usp_GetWorkspaceGates, keyed by its lifecycle.</summary>
public sealed class GateDefinitionRow
{
    public Guid GateDefinitionId { get; set; }
    public Guid LifecycleId { get; set; }
    public string Name { get; set; } = string.Empty;
    public Guid FromStageId { get; set; }
    public Guid ToStageId { get; set; }
    public string JoinKind { get; set; } = string.Empty;
    public int SortOrder { get; set; }
}

/// <summary>One gate-slot row from usp_GetWorkspaceGateSlots, with the live eligible count.</summary>
public sealed class GateSlotRow
{
    public Guid GateDefinitionId { get; set; }
    public string RoleLabel { get; set; } = string.Empty;
    public int SlotIndex { get; set; }
    public int EligibleCount { get; set; }
}

/// <summary>One role-label row from usp_GetRoleLabelCatalog (platform-scope).</summary>
public sealed class RoleLabelRow
{
    public Guid RoleLabelId { get; set; }
    public string Label { get; set; } = string.Empty;
    public int SortOrder { get; set; }
}

/// <summary>One approver-team member row from usp_GetWorkspaceApproverTeams.</summary>
public sealed class ApproverTeamMemberRow
{
    public string RoleLabel { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    /// <summary>PII (display name). Presentation only — never logged.</summary>
    public string DisplayName { get; set; } = string.Empty;
}

/// <summary>The resolved member returned by usp_AddApproverTeamMember.</summary>
public sealed class ApproverMemberResultRow
{
    public Guid UserId { get; set; }
    /// <summary>PII (display name). Presentation only — never logged.</summary>
    public string DisplayName { get; set; } = string.Empty;
}

// ─── Slice 5 (Requests core) — keyless read projections ────────────────────────────────
// Requests and Drafts are read/written through stored procedures (mint + origin resolution,
// optimistic-concurrency PATCH, multi-filter list → api-data-access.md). The API never tracks the
// Requests / Drafts tables as EF entities — only these keyless projections bound through FromSqlRaw
// (plus raw ADO.NET for the two-result-set list read in usp_QueryRequests).

/// <summary>One full Request row from usp_GetRequestByIdForUser (access baked into the proc join).</summary>
public sealed class RequestRow
{
    public string RecordId { get; set; } = string.Empty;
    public Guid WorkspaceId { get; set; }
    public Guid LifecycleId { get; set; }
    public string Origin { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Stage { get; set; } = string.Empty;
    public DateTime Submitted { get; set; }
    /// <summary>Content-field map (JSON). Confidential — never logged.</summary>
    public string FieldValues { get; set; } = "{}";
    public int? PriorityScore { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;
    /// <summary>SQL rowversion — surfaced as the base64 ETag for optimistic concurrency.</summary>
    public byte[] RowVer { get; set; } = Array.Empty<byte>();
}

/// <summary>One draft row from usp_GetDraftById / usp_GetDraftsForUser (owner-scoped).</summary>
public sealed class DraftRow
{
    public Guid DraftId { get; set; }
    public Guid OwnerUserId { get; set; }
    public Guid WorkspaceId { get; set; }
    public string ObjectType { get; set; } = string.Empty;
    public string? Title { get; set; }
    /// <summary>Prefilled body (JSON). Confidential — never logged.</summary>
    public string Body { get; set; } = "{}";
    public DateTime LastEditedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>The affected-row count returned by usp_DeleteDraft.</summary>
public sealed class DraftDeleteRow
{
    public int Deleted { get; set; }
}

/// <summary>
/// One interleaved item from usp_GetActivityThread (comments UNION audit events, access baked into
/// the proc). Kind discriminates: comment columns are set for 'comment', event columns for 'event'.
/// Body / EventPayload are Confidential — never logged (api-pii-handling.md).
/// </summary>
public sealed class ActivityThreadRow
{
    public string Kind { get; set; } = string.Empty;
    public DateTime ItemAt { get; set; }
    public Guid? CommentId { get; set; }
    public Guid? AuthorUserId { get; set; }
    public string? Body { get; set; }
    public string? MentionedUserIds { get; set; }
    public string? EventType { get; set; }
    public Guid? ActorUserId { get; set; }
    public string? EventPayload { get; set; }
}

/// <summary>One similar-requests match from usp_FindSimilarRequests (access baked into the proc join).</summary>
public sealed class SimilarRequestRow
{
    public string RecordId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Stage { get; set; }
    public string? Origin { get; set; }
}

// ─── Slice 7 (Tasks) — keyless read projections ───────────────────────────────────────
// Tasks are read/written through stored procedures (access-gated joins, per-record ordering,
// bundle expansion → api-data-access.md). The API never tracks the Tasks / TaskBundleTemplate
// tables as EF entities — only these keyless projections bound through FromSqlRaw. Titles / notes
// / field values are Confidential — never logged (api-pii-handling.md).

/// <summary>
/// One task row from usp_GetTasksForRequest / usp_CreateTask / usp_PatchTask / usp_ApplyTaskBundle.
/// The typed field is stored inline: FieldType names which single FieldValue* column holds the value.
/// </summary>
public sealed class TaskRow
{
    public Guid TaskId { get; set; }
    public string RecordId { get; set; } = string.Empty;
    public Guid WorkspaceId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Phase { get; set; } = string.Empty;
    public Guid? AssigneeUserId { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public DateTime? CompletedAt { get; set; }
    public int SortOrder { get; set; }
    public Guid? FieldDefinitionId { get; set; }
    public string? FieldLabel { get; set; }
    public string? FieldType { get; set; }
    public string? FieldValueUrl { get; set; }
    public string? FieldValueText { get; set; }
    public decimal? FieldValueNumber { get; set; }
    public DateTime? FieldValueDate { get; set; }
    public string? FieldValueSelect { get; set; }
    public bool? FieldValueBool { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>One bundle-template row from usp_GetTaskBundleTemplates (TasksJson projected API-side).</summary>
public sealed class TaskBundleTemplateRow
{
    public Guid TaskBundleTemplateId { get; set; }
    public string TemplateKey { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string TasksJson { get; set; } = "[]";
    public int SortOrder { get; set; }
}

/// <summary>One task-library field from usp_GetTaskField (validate + resolve label at capture time).</summary>
public sealed class TaskFieldRow
{
    public Guid FieldDefinitionId { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string FieldType { get; set; } = string.Empty;
}
