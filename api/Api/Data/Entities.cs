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
    /// <summary>The SLA "Due soon" window in days (slice 21, §17.2). Default 3.</summary>
    public int DueSoonWindowDays { get; set; } = 3;
    /// <summary>Days added to a request's Deploy Date to default its Benefit-review date
    /// (time-based triggers slice 3, §17.11). Default 90.</summary>
    public int BenefitReviewOffsetDays { get; set; } = 90;
    /// <summary>Days added to an approval gate's OpenedAt to default its approver RespondByDate (Slice 5).
    /// Per-workspace config; default 5.</summary>
    public int ApprovalRespondByDays { get; set; } = 5;
    /// <summary>Phase 4 — the AI-assist off-switch (§14). Default false; a workspace admin opts in.</summary>
    public bool AiAssistEnabled { get; set; }
    /// <summary>Phase 4 — JSON array of content-field keys the AI layer may read and send to a provider.
    /// Default the three non-PII intake fields; never client/matter numbers or identities.</summary>
    public string AiContentFieldAllowlist { get; set; } = "[\"Name\",\"Description\",\"WorkflowDetails\"]";
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
    public Guid? WorkspaceId { get; set; }
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
    public bool IsSystemProvisioned { get; set; }
    public string? PlatformFieldKey { get; set; }
    // 'Global' (available to every workspace) | 'LocalWorkspace' (this workspace only).
    public string Location { get; set; } = "LocalWorkspace";
    public string? VisibleStagesJson { get; set; }
    public string? CrossingToFieldKey { get; set; }
    public decimal? MinValue { get; set; }
    public decimal? MaxValue { get; set; }
    public bool AllowNewValues { get; set; }
    public int SortOrder { get; set; }
    public bool IsRetired { get; set; }
    // True when the row belongs to the reading workspace; false for a foreign Global field
    // (read-only here — editable only from its owning workspace).
    public bool IsLocal { get; set; }
    public string? DerivedKind { get; set; }
    public string? DerivedExpression { get; set; }
    public string? DerivedDefaultValue { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>One flat row from usp_GetWorkspaceFieldCatalog — the reconciled S30 Fields tab table.</summary>
public sealed class FieldCatalogRow
{
    public Guid FieldDefinitionId { get; set; }
    public Guid WorkspaceId { get; set; }
    public string ObjectType { get; set; } = string.Empty;
    public string FieldKey { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string FieldType { get; set; } = string.Empty;
    public string Location { get; set; } = "LocalWorkspace";
    public bool IsRequired { get; set; }
    public bool IsReadOnly { get; set; }
    public bool IsPlatformDefined { get; set; }
    public bool IsSystemProvisioned { get; set; }
    public bool IsRetired { get; set; }
    public bool IsLocal { get; set; }
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
    /// <summary>PII (email). Presentation only (S29 Approver teams member rows) — never logged.</summary>
    public string Email { get; set; } = string.Empty;
}

/// <summary>The resolved member returned by usp_AddApproverTeamMember.</summary>
public sealed class ApproverMemberResultRow
{
    public Guid UserId { get; set; }
    /// <summary>PII (display name). Presentation only — never logged.</summary>
    public string DisplayName { get; set; } = string.Empty;
}

// ─── Slice 19 (Platform admin) — keyless read projections ──────────────────────────────

/// <summary>One crossing-map row from usp_GetCrossingMap / usp_ProposeCrossingMap / usp_ConfirmCrossingMap
/// (S35). Seeded rows carry a null CrossingMapId and Status='Seeded'; durable rows carry the id, the
/// option map, and the confirmed audit. Field types are the schema's display strings.</summary>
public sealed class CrossingMapRow
{
    public Guid? CrossingMapId { get; set; }
    public string SourceFieldKey { get; set; } = string.Empty;
    public string SourceDisplayName { get; set; } = string.Empty;
    public string SourceFieldType { get; set; } = string.Empty;
    public string TargetFieldKey { get; set; } = string.Empty;
    public string TargetDisplayName { get; set; } = string.Empty;
    public string TargetFieldType { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? OptionCorrespondenceJson { get; set; }
    public string? ConfirmedByUserId { get; set; }
    public DateTime? ConfirmedAt { get; set; }
}

/// <summary>One mappable field for the S35 propose form, from usp_GetCrossingCandidates (Side='PG'|'AI').</summary>
public sealed class CrossingCandidateRow
{
    public Guid FieldDefinitionId { get; set; }
    public string Side { get; set; } = string.Empty;
    public string FieldKey { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string FieldType { get; set; } = string.Empty;
}

/// <summary>One privileged-grant row from usp_ListPrivilegedGrants (S36). Workspace fields are null
/// for a PlatformAdmin grant. DisplayName / Email are PII — presentation only, never logged.</summary>
public sealed class PrivilegedGrantRow
{
    public string GrantKind { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public Guid? WorkspaceId { get; set; }
    public string? WorkspaceName { get; set; }
    public DateTime GrantedAt { get; set; }
}

/// <summary>The resolved user returned by usp_UpsertPlatformAdminGrant.</summary>
public sealed class PlatformAdminGrantResultRow
{
    public Guid UserId { get; set; }
    /// <summary>PII (display name). Presentation only — never logged.</summary>
    public string DisplayName { get; set; } = string.Empty;
    public bool WasAdded { get; set; }
}

/// <summary>The new workspace summary returned by usp_ProvisionWorkspace (S38).</summary>
public sealed class WorkspaceProvisionRow
{
    public Guid WorkspaceId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
    public string Prefix { get; set; } = string.Empty;
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
    /// <summary>Due Date (projected from the field map) — drives SLA Status (slice 21, §17.2). Null = no SLA.</summary>
    public DateOnly? DueDate { get; set; }
    /// <summary>UTC timestamp the record's current stage began — drives time-in-stage (slice 21, §10.6).</summary>
    public DateTime? StageEnteredAt { get; set; }
    /// <summary>The record's workspace due-soon window (slice 21) — the SLA "Due soon" threshold in days.</summary>
    public int DueSoonWindowDays { get; set; }
    /// <summary>Record Status/hold ('InProgress' | 'OnHold'). ('Abandoned' retired — close/status cleanup.)</summary>
    public string StatusHold { get; set; } = "InProgress";
    /// <summary>Slice 26 — free-text note; null on InProgress.</summary>
    public string? StatusHoldNote { get; set; }
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

// ─── Slice 9 (Escalation bridge) — keyless read projections ────────────────────────────

/// <summary>
/// One crossing field ([S]) from usp_GetCrossingFields — the workspace's own crossing map,
/// marked on FieldDefinition (Category='Crossing'). The Escalation module reads this to snapshot +
/// map the PG-side values into the AI-side row. CrossingToFieldKey is the 1:1 AI-side target key.
/// </summary>
public sealed class CrossingFieldRow
{
    public string FieldKey { get; set; } = string.Empty;
    public string? CrossingToFieldKey { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public bool IsRequired { get; set; }
}

/// <summary>
/// The escalation-bridge inputs for a record from usp_GetBridgeForRecord (membership-gated for the
/// caller's own side; the AI-side row is read system-side because the mirror is system-computed,
/// BS §6.4). Zero rows means "not escalated" or "caller can't see the record". The mirror status
/// string is derived read-time from AiStage + hold/outcome in AiFieldValues (Confidential — the
/// field map is never logged).
/// </summary>
public sealed class BridgeRow
{
    public string RecordId { get; set; } = string.Empty;
    public Guid OriginWorkspaceId { get; set; }
    public string OriginWorkspaceName { get; set; } = string.Empty;
    public Guid AiWorkspaceId { get; set; }
    public DateTime EscalatedAt { get; set; }
    public string AiStage { get; set; } = string.Empty;
    public string AiFieldValues { get; set; } = "{}";
    public Guid CallerWorkspaceId { get; set; }
    public bool CallerOnAiSide { get; set; }
    public string LockedFieldKeysJson { get; set; } = "[]";
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
    public DateOnly? DueDate { get; set; }
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

/// <summary>One task row from usp_GetTasksForWorkspace — the workspace-wide export projection.
/// Carries the parent Request id, the assignee's and creator's resolved display names (LEFT-joined,
/// so an unassigned / seeded task still exports), the created date, and the single captured typed
/// field (its label plus the one value column that is set, coalesced to text). Title / Notes /
/// FieldValue are Confidential — never logged.</summary>
public sealed class WorkspaceTaskExportRow
{
    public Guid TaskId { get; set; }
    public string RecordId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Phase { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public Guid? AssigneeUserId { get; set; }
    public string? AssigneeName { get; set; }
    public string? CreatedByName { get; set; }
    public string? FieldLabel { get; set; }
    public string? FieldValue { get; set; }
}

/// <summary>One request row from usp_GetRequestsForWorkspace — the workspace-wide export projection.
/// Carries the RecordId (the export identity) and the whole FieldValues JSON map, from which the API
/// projects every column the workspace field catalog defines. FieldValues is Confidential — never
/// logged.</summary>
public sealed class WorkspaceRequestExportRow
{
    public string RecordId { get; set; } = string.Empty;
    public string FieldValues { get; set; } = "{}";
}

/// <summary>One feature row from usp_GetFeaturesForWorkspace — the hub-scoped export projection.
/// Carries the RecordId (the export identity) and the whole FieldValues JSON map, from which the API
/// projects every column the Feature field catalog defines. FieldValues is Confidential — never
/// logged.</summary>
public sealed class WorkspaceFeatureExportRow
{
    public string RecordId { get; set; } = string.Empty;
    public string FieldValues { get; set; } = "{}";
}

/// <summary>One attachment row from usp_GetAttachmentsForWorkspace — the workspace-wide export
/// projection. UploadedByName is the uploader's resolved display name (LEFT-joined; null for a
/// seeded / non-user actor). File names are Confidential-adjacent — never logged.</summary>
public sealed class WorkspaceAttachmentExportRow
{
    public Guid AttachmentId { get; set; }
    public string RecordId { get; set; } = string.Empty;
    public string ObjectType { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public bool IsLink { get; set; }
    public string? ExternalUrl { get; set; }
    public DateTime CreatedAt { get; set; }
    public string? UploadedByName { get; set; }
}

/// <summary>One toolkit-item row from usp_GetToolkitForWorkspace — the workspace-wide export
/// projection with every user-meaningful column. UpdatedByName is the updater's resolved display
/// name (LEFT-joined; null for a seeded / non-user actor).</summary>
public sealed class WorkspaceToolkitExportRow
{
    public string RecordId { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? OneLiner { get; set; }
    public string? Description { get; set; }
    public string? Maintainer { get; set; }
    public string? HowTo { get; set; }
    public string? BodyMarkdown { get; set; }
    public string? AttachmentFileName { get; set; }
    public bool HasAttachment { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string? UpdatedByName { get; set; }
}

// ─── Slice 10 (Closure, Copy, Typed links) — keyless read projections ──────────────────
// TypedLinks are read/written through stored procedures (access-respecting far-side resolution,
// soft-delete, queued-link stamping in usp_CreateRequest → api-data-access.md). The API never
// tracks the TypedLinks table as an EF entity — only this keyless projection bound via FromSqlRaw.

/// <summary>
/// One typed link from usp_GetTypedLinksForRecord / usp_CreateTypedLink. ToName / ToStage are the
/// far record's name + stage, resolved only when the caller can see the far side (NULL otherwise —
/// the id is all that is disclosed, BS §22.6). Name is Confidential — never logged.
/// </summary>
public sealed class TypedLinkRow
{
    public Guid LinkId { get; set; }
    public string FromRecordId { get; set; } = string.Empty;
    public string ToRecordId { get; set; } = string.Empty;
    public string LinkKind { get; set; } = string.Empty;
    public string? Rationale { get; set; }
    public string? ToName { get; set; }
    public string? ToStage { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>The affected-row count + soft-deleted link's FROM record from usp_DeleteTypedLink (0 → 403).</summary>
public sealed class TypedLinkDeleteRow
{
    public int Deleted { get; set; }
    public string? FromRecordId { get; set; }
}

/// <summary>The gate a transition is guarded by (usp_GetGateForTransition) — or no row when ungated.</summary>
public sealed class GateForTransitionRow
{
    public Guid GateDefinitionId { get; set; }
    public string GateName { get; set; } = string.Empty;
    public string FromStageKey { get; set; } = string.Empty;
    public string ToStageKey { get; set; } = string.Empty;
    public string FromStageLabel { get; set; } = string.Empty;
    public string ToStageLabel { get; set; } = string.Empty;
}

/// <summary>
/// One ApprovalRequest (gate) with its decisions rolled up as JSON, from vw_ApprovalRequestDetail
/// via the gate procs. FrozenApproverSet and DecisionsJson are parsed into the wire DTO shapes.
/// </summary>
public sealed class ApprovalRequestRow
{
    public Guid ApprovalRequestId { get; set; }
    public string RequestRecordId { get; set; } = string.Empty;
    public Guid WorkspaceId { get; set; }
    public Guid GateDefinitionId { get; set; }
    public string GateName { get; set; } = string.Empty;
    public string FromStageKey { get; set; } = string.Empty;
    public string ToStageKey { get; set; } = string.Empty;
    public string FromStageLabel { get; set; } = string.Empty;
    public string ToStageLabel { get; set; } = string.Empty;
    public string State { get; set; } = string.Empty;
    public DateTime OpenedAt { get; set; }
    public DateTime? ResolvedAt { get; set; }
    /// <summary>Date the frozen approvers are expected to respond by (OpenedAt + the workspace's
    /// ApprovalRespondByDays), stamped at gate-open. NULL for gates opened before Slice 5. Drives the
    /// built-in ApprovalOverdue trigger.</summary>
    public DateOnly? RespondByDate { get; set; }
    /// <summary>Snapshot of slots + eligible members at open (JSON). Parsed into FrozenApproverSlotDto[].</summary>
    public string FrozenApproverSet { get; set; } = "[]";
    /// <summary>Slot decisions rolled up (JSON). Parsed into ApprovalDecisionDto[].</summary>
    public string DecisionsJson { get; set; } = "[]";
}

/// <summary>One attachment row from usp_GetAttachmentsForRecord (the Attachments card). BlobPath is
/// deliberately NOT selected — the pointer never leaves the server (slice 11).</summary>
public sealed class AttachmentListRow
{
    public Guid AttachmentId { get; set; }
    public string RecordId { get; set; } = string.Empty;
    public string ObjectType { get; set; } = string.Empty;
    public Guid WorkspaceId { get; set; }
    /// <summary>Can name a client artifact — Confidential-adjacent; never logged.</summary>
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public bool IsLink { get; set; }
    public string? ExternalUrl { get; set; }
    public DateTime CreatedAt { get; set; }
    public string CreatedBy { get; set; } = string.Empty;
}

/// <summary>One attachment resolved for download / delete from usp_GetAttachmentById (access-gated).
/// Carries the BlobPath so the API can stream the bytes; the client never sees it.</summary>
public sealed class AttachmentDownloadRow
{
    public Guid AttachmentId { get; set; }
    public string RecordId { get; set; } = string.Empty;
    public Guid WorkspaceId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public string BlobPath { get; set; } = string.Empty;
    public bool IsLink { get; set; }
    public string? ExternalUrl { get; set; }
}

// Slice 12 (Watchers + Notifications) — keyless proc projections.

/// <summary>One live watcher from usp_GetWatchers — carries DisplayName so the card renders the
/// avatar/initials without a directory fetch (slice 12). Slice 26 adds the caller's own five
/// preference booleans (null on rows for other watchers — a watcher never sees another's prefs).</summary>
public sealed class WatcherListRow
{
    public Guid UserId { get; set; }
    /// <summary>Display name — shown in the roster; never logged (api-logging.md).</summary>
    public string DisplayName { get; set; } = string.Empty;
    public DateTime SubscribedAt { get; set; }
    // Slice 26 — sparse per-record preferences, only populated on the caller's own row.
    public bool? NotifyGateDecisions { get; set; }
    public bool? NotifyStatusChanges { get; set; }
    public bool? NotifyTaskSignoffs { get; set; }
    public bool? NotifySlaAndDueDateReminders { get; set; }
    public bool? NotifyMentionsAndComments { get; set; }
}

/// <summary>The caller's own effective notification preferences for a record (usp_GetMyWatcherPreferences),
/// returned independent of watch state so the always-visible toggles read/persist correctly (slice 26
/// prototype reconciliation). Non-nullable — the proc ISNULLs a missing preference row to true.</summary>
public sealed class MyWatcherPreferencesRow
{
    public bool NotifyGateDecisions { get; set; }
    public bool NotifyStatusChanges { get; set; }
    public bool NotifyTaskSignoffs { get; set; }
    public bool NotifySlaAndDueDateReminders { get; set; }
    public bool NotifyMentionsAndComments { get; set; }
}

/// <summary>One bell notification from usp_QueryNotifications. TotalCount is the windowed
/// COUNT(*) OVER() so the read is one result set (slice 12).</summary>
public sealed class NotificationRow
{
    public Guid NotificationId { get; set; }
    public string Category { get; set; } = string.Empty;
    public string? RecordId { get; set; }
    /// <summary>Set for an 'announcement-posted' row — the bell deep-link target (slice 13).</summary>
    public Guid? AnnouncementId { get; set; }
    public string Summary { get; set; } = string.Empty;
    public Guid SourceEventId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ReadAt { get; set; }
    public int TotalCount { get; set; }
}

/// <summary>Single-row unread count from usp_GetUnreadCount — drives the bell badge (slice 12).</summary>
public sealed class UnreadCountRow
{
    public int UnreadCount { get; set; }
}

/// <summary>Full announcement detail from usp_GetAnnouncementById (slice 13). Audience is the raw JSON
/// document ({ kind, roleLabels?, userIds? }); the service parses it into AnnouncementAudience.</summary>
public sealed class AnnouncementRow
{
    public Guid AnnouncementId { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid AuthorUserId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public bool Pinned { get; set; }
    public DateTime? ExpiresOn { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTime? ScheduledPublishAt { get; set; }
    public bool AutoArchive { get; set; }
    public DateTime? AutoArchiveAt { get; set; }
    public DateTime? PublishedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    /// <summary>Set on the per-workspace copies fanned out from one platform broadcast (all copies share
    /// it); NULL on workspace-authored announcements.</summary>
    public Guid? BroadcastId { get; set; }
}

/// <summary>A browse/manage row from usp_QueryAnnouncements(ForManage) (slice 13; reconciled 2026-07-21).
/// The manage list carries the stored Status plus the lifecycle timestamps so the service derives the
/// display status once, the poster's display name, and PostedAt for the POSTED column. TotalCount is the
/// windowed COUNT(*) OVER() so the read is one result set.</summary>
public sealed class AnnouncementListRowEntity
{
    public Guid AnnouncementId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string BodySnippet { get; set; } = string.Empty;
    public bool Pinned { get; set; }
    public DateTime? PublishedAt { get; set; }
    public DateTime? ScheduledPublishAt { get; set; }
    public bool AutoArchive { get; set; }
    public DateTime? AutoArchiveAt { get; set; }
    public string Status { get; set; } = string.Empty;
    public Guid AuthorUserId { get; set; }
    public string? AuthorName { get; set; }
    public DateTime? PostedAt { get; set; }
    public int TotalCount { get; set; }
}

/// <summary>A grouped broadcast row from usp_QueryPlatformAnnouncements — one per BroadcastId, aggregated
/// across the per-workspace copies. WorkspaceCount is how many workspaces the broadcast fanned out to;
/// TotalCount is the windowed COUNT(*) OVER() (number of distinct broadcasts).</summary>
public sealed class PlatformAnnouncementRowEntity
{
    public Guid BroadcastId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public bool Pinned { get; set; }
    public DateTime? PublishedAt { get; set; }
    public DateTime? ScheduledPublishAt { get; set; }
    public bool AutoArchive { get; set; }
    public DateTime? AutoArchiveAt { get; set; }
    public string Status { get; set; } = string.Empty;
    public Guid AuthorUserId { get; set; }
    public string? AuthorName { get; set; }
    public DateTime? PostedAt { get; set; }
    public int WorkspaceCount { get; set; }
    public int TotalCount { get; set; }
}

/// <summary>A workspace a platform admin may broadcast to, from usp_ListPlatformWorkspaces.</summary>
public sealed class PlatformWorkspaceRow
{
    public Guid WorkspaceId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
}

/// <summary>One per-workspace copy of a broadcast, from usp_GetBroadcastCopies — used to fan out the bell
/// event per copy when a Scheduled broadcast is published early via edit.</summary>
public sealed class BroadcastCopyRow
{
    public Guid AnnouncementId { get; set; }
    public Guid WorkspaceId { get; set; }
    public string Status { get; set; } = string.Empty;
}

/// <summary>A newly-published row returned by usp_TickAnnouncements (Announcements scheduler, slice 2).
/// The tick flips due Scheduled rows to Published and returns them so the Worker emits exactly one
/// announcement.published event per row through the same event-spine path manual publish uses.</summary>
public sealed class AnnouncementTickRow
{
    public Guid AnnouncementId { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid AuthorUserId { get; set; }
}

// ─── Slice 14 (Feature Catalog + Saved views) — keyless read projections ───────────────

/// <summary>One full Feature row from usp_GetFeatureByIdForUser (access baked into the proc join).</summary>
public sealed class FeatureRow
{
    public string RecordId { get; set; } = string.Empty;
    public Guid WorkspaceId { get; set; }
    public string Origin { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Maturity { get; set; } = string.Empty;
    /// <summary>Content-field map (JSON). Confidential — never logged.</summary>
    public string FieldValues { get; set; } = "{}";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;
    /// <summary>SQL rowversion — surfaced as the base64 ETag for optimistic concurrency.</summary>
    public byte[] RowVer { get; set; } = Array.Empty<byte>();
}

/// <summary>One SavedView row from usp_ListSavedViews / usp_GetSavedViewById.</summary>
public sealed class SavedViewRow
{
    public Guid SavedViewId { get; set; }
    public Guid WorkspaceId { get; set; }
    public string ObjectType { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Scope { get; set; } = string.Empty;
    public Guid OwnerUserId { get; set; }
    public bool IsDefault { get; set; }
    public string ColumnsJson { get; set; } = "[]";
    public string FiltersJson { get; set; } = "{}";
    public string SortJson { get; set; } = "[]";
    public string CreatedBy { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

// ─── Slice 16 (CSV Import & Export) — keyless read projections ──────────────────────────
// The Imports / ImportRows tables are read via stored procedures (admin-gated joins) and written via
// usp_CreateImport / usp_RecordImportRow / usp_CompleteImport. The API tracks neither as an EF entity
// — only these keyless projections bound through FromSqlRaw.

/// <summary>One import job row from usp_GetImportById (admin access baked into the proc join).</summary>
public sealed class ImportJobRow
{
    public Guid ImportId { get; set; }
    public Guid WorkspaceId { get; set; }
    /// <summary>The uploaded file name — Confidential-adjacent; never logged.</summary>
    public string FileName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public int TotalRows { get; set; }
    public int LandedRows { get; set; }
    public int FlaggedRows { get; set; }
    public int CreatedRows { get; set; }
    public int UpdatedRows { get; set; }
    public Guid StartedByUserId { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}

/// <summary>One reasoned import row (hard failure or fallback warning) from usp_GetImportRows.</summary>
public sealed class ImportReportRow
{
    public int RowIndex { get; set; }
    public string Outcome { get; set; } = string.Empty;
    public string? RecordId { get; set; }
    /// <summary>`[{code,message,field}]` JSON. Messages are PII-free (field + rule only).</summary>
    public string? ReasonsJson { get; set; }
}

// ─── Slice 17 (Users & access admin) — keyless read/write projections ────────────────────
// WorkspaceMembership + Users are read via usp_ListWorkspaceMembers (a join → out of single-table
// EF CRUD) and mutated via usp_UpsertWorkspaceMembership / usp_DeactivateMember. Only these keyless
// projections are bound through FromSqlRaw.

/// <summary>
/// One S29 members-list row from usp_ListWorkspaceMembers — a real membership OR a pending invitation.
/// For an invitation row UserId / DisplayName / LastActiveAt are null and InvitationId is set; for a
/// membership row InvitationId is null. Status is 'Active' | 'Suspended' | 'Invited'.
/// </summary>
public sealed class WorkspaceMemberRow
{
    public Guid? UserId { get; set; }
    /// <summary>PII — never logged (api-logging.md). Null for a pending invitation.</summary>
    public string? DisplayName { get; set; }
    /// <summary>PII — never logged.</summary>
    public string Email { get; set; } = string.Empty;
    public string Level { get; set; } = string.Empty;
    public bool IsDisabled { get; set; }
    public DateTime? LastActiveAt { get; set; }
    public string Status { get; set; } = string.Empty;
    public Guid? InvitationId { get; set; }
}

/// <summary>
/// The outcome returned by usp_UpsertWorkspaceMembership. Outcome is 'Member' (added/level-changed
/// against a real user — UserId set) or 'Invited' (a pending invitation was created — UserId null).
/// </summary>
public sealed class MembershipUpsertResultRow
{
    public Guid? UserId { get; set; }
    public string Level { get; set; } = string.Empty;
    public bool WasAdded { get; set; }
    public string Outcome { get; set; } = string.Empty;
}

/// <summary>Whether usp_CancelInvitation cancelled a live invitation (0 = no matching live invite).</summary>
public sealed class CancelInvitationRow
{
    public bool Cancelled { get; set; }
}

// ─── Slice 22 (Home surface) — keyless panel projections ───────────────────────────────

/// <summary>One "Needs your decision" row from usp_GetHomeDecisions. TotalCount is the windowed match.</summary>
public sealed class HomeDecisionRow
{
    public string RecordId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string GateLabel { get; set; } = string.Empty;
    public string RoleLabel { get; set; } = string.Empty;
    public DateTime OpenedAt { get; set; }
    public int TotalCount { get; set; }
}

/// <summary>One "Your work today" row from usp_GetHomeWork. SLA is derived API-side from DueDate +
/// DueSoonWindowDays (RequestsService.ComputeSla). TotalCount is the windowed match.</summary>
public sealed class HomeWorkRow
{
    public string RecordId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string StageLabel { get; set; } = string.Empty;
    public string Origin { get; set; } = string.Empty;
    public DateTime? DueDate { get; set; }
    public int DueSoonWindowDays { get; set; }
    public int TotalCount { get; set; }
}

/// <summary>One "New to triage" row from usp_GetHomeTriage. TotalCount is the windowed match.</summary>
public sealed class HomeTriageRow
{
    public string RecordId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Origin { get; set; } = string.Empty;
    public DateTime ReceivedAt { get; set; }
    public int TotalCount { get; set; }
}

/// <summary>One pinned-announcement row from usp_GetHomePinnedAnnouncements.</summary>
public sealed class HomePinnedAnnouncementRow
{
    public Guid AnnouncementId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string BodySnippet { get; set; } = string.Empty;
    public DateTime? PublishedAt { get; set; }
}

// ─── Slice 23 (Seeded Dashboards) — keyless read projections ───────────────────────────
// The SavedDashboard table is read via stored procedures (list / by-id) and the metric resolvers;
// writes go through usp_UpdateDashboard. The API tracks the table only through these keyless
// projections bound via FromSqlRaw. The two records-grid procs (#15, #16) return two result sets
// and are read through raw ADO in DashboardMetricResolver — they need no keyless row here.

/// <summary>One dashboard list row from usp_ListDashboards (metadata + widget count).</summary>
public sealed class DashboardListRow
{
    public Guid SavedDashboardId { get; set; }
    public Guid WorkspaceId { get; set; }
    // v2 (slice 28): NULL on user-composed dashboards (only the four seeded starters carry a slug).
    public string? Slug { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string AudienceJson { get; set; } = "{}";
    public bool IsDefault { get; set; }
    public string ObjectType { get; set; } = string.Empty;
    public int WidgetCount { get; set; }
    public DateTime UpdatedAt { get; set; }
    // v2 (slice 28) — composer columns.
    public bool IsSeeded { get; set; }
    public string Visibility { get; set; } = "Shared";
    public string LayoutMode { get; set; } = "Fixed";
}

/// <summary>The single dashboard row from usp_GetDashboardById (carries the WidgetsJson to compose).</summary>
public sealed class DashboardRow
{
    public Guid SavedDashboardId { get; set; }
    public Guid WorkspaceId { get; set; }
    // v2 (slice 28): NULL on user-composed dashboards.
    public string? Slug { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string AudienceJson { get; set; } = "{}";
    public bool IsDefault { get; set; }
    public string ObjectType { get; set; } = string.Empty;
    public bool SupportsDrillThrough { get; set; }
    public string WidgetsJson { get; set; } = "[]";
    // v2 (slice 28) — composer columns.
    public bool IsSeeded { get; set; }
    public string Visibility { get; set; } = "Shared";
    public string LayoutMode { get; set; } = "Fixed";
    public string CreatedBy { get; set; } = string.Empty;
}

/// <summary>usp_GetDashboardComposedBreakdown — one open-record count per group-by label (slice 28).</summary>
public sealed class DashboardComposedBreakdownRow
{
    public string Label { get; set; } = string.Empty;
    public int Cnt { get; set; }
}

/// <summary>usp_CreateDashboard — the new composed dashboard's id (slice 28).</summary>
public sealed class CreatedDashboardIdRow
{
    public Guid SavedDashboardId { get; set; }
}

/// <summary>pipeline-by-category — one open-record count per status category.</summary>
public sealed class DashboardCategoryCountRow
{
    public string Category { get; set; } = string.Empty;
    public int Cnt { get; set; }
}

/// <summary>escalations-by-quarter-origin — this-quarter vs prior-quarter escalation counts per origin.</summary>
public sealed class DashboardEscalationQuarterRow
{
    public string Origin { get; set; } = string.Empty;
    public int ThisCnt { get; set; }
    public int PriorCnt { get; set; }
}

/// <summary>unassigned-past-intake / requests-by-origin — one count per origin.</summary>
public sealed class DashboardOriginCountRow
{
    public string Origin { get; set; } = string.Empty;
    public int Cnt { get; set; }
}

/// <summary>closures-by-outcome — one closed-record count per outcome.</summary>
public sealed class DashboardOutcomeCountRow
{
    public string Outcome { get; set; } = string.Empty;
    public int Cnt { get; set; }
}

/// <summary>origin-by-status-heatmap — one count per (origin, column key) pair.</summary>
public sealed class DashboardHeatmapCellRow
{
    public string Origin { get; set; } = string.Empty;
    public string ColKey { get; set; } = string.Empty;
    public int Cnt { get; set; }
}

/// <summary>open-per-analyst — one open-record count per assigned analyst.</summary>
public sealed class DashboardAnalystCountRow
{
    public string Analyst { get; set; } = string.Empty;
    public int Cnt { get; set; }
}

/// <summary>A single scalar count (pending-signoff, features-published).</summary>
public sealed class DashboardScalarCountRow
{
    public int Cnt { get; set; }
}

/// <summary>median-time-to-triage — trailing-window median vs the prior window (NULL when no data).</summary>
public sealed class DashboardMedianTriageRow
{
    public double? MedianDays { get; set; }
    public double? PriorMedianDays { get; set; }
}

/// <summary>aging-in-stage — one open-record count per age bucket, in bucket order.</summary>
public sealed class DashboardAgingBucketRow
{
    public string Bucket { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public int Cnt { get; set; }
}

/// <summary>features-by-type — one Published-feature count per type label.</summary>
public sealed class DashboardTypeCountRow
{
    public string TypeLabel { get; set; } = string.Empty;
    public int Cnt { get; set; }
}

/// <summary>features-by-tech — one Published-feature count per tech / stack label.</summary>
public sealed class DashboardTechCountRow
{
    public string TechLabel { get; set; } = string.Empty;
    public int Cnt { get; set; }
}

/// <summary>escalation-status — records whose AI Solutions Status is set vs blank.</summary>
public sealed class DashboardEscalationStatusRow
{
    public int SetCnt { get; set; }
    public int BlankCnt { get; set; }
}

// ─── Time-based triggers (Slice: triggers-engine-core, Task 1.2) ───────────────
// Keyless projections read via FromSqlRaw from the trigger procs (Task 1.3). Reads/writes
// follow the codebase convention — procs, not EF LINQ CRUD (api-data-access.md).

/// <summary>One enabled 'Authored' trigger with its "when" rows rolled up as JSON — from
/// usp_GetEnabledAuthoredTriggers. ConditionsJson parses into ConditionRule[] in the evaluator.</summary>
public sealed class EnabledTriggerRow
{
    public Guid TriggerId { get; set; }
    public Guid WorkspaceId { get; set; }
    public string ObjectType { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Cadence { get; set; } = string.Empty;
    public int? RepeatIntervalDays { get; set; }
    /// <summary>The notification category / payload kind the trigger fires under (sla-reminder etc.).</summary>
    public string NotificationCategory { get; set; } = string.Empty;
    /// <summary>JSON array of user-reference field keys to notify (e.g. ["assignedAnalyst","watchers"]).</summary>
    public string Recipients { get; set; } = "[]";
    public string NotificationTitle { get; set; } = string.Empty;
    public string NotificationBody { get; set; } = string.Empty;
    /// <summary>The ANDed condition rows as a JSON array — {whenFieldKey, comparator, compareValue}.</summary>
    public string ConditionsJson { get; set; } = "[]";
}

/// <summary>A candidate record for a trigger — from usp_GetTriggerCandidates. For an Authored (Request)
/// trigger this carries the record's full field-value map, which the evaluator fine-checks the condition
/// over; for a built-in TaskOverdue trigger it carries the assignee to notify and no field map (the SQL
/// pre-filter is the whole condition). <see cref="RecordId"/> is always the fan-out target (the parent
/// Request id for a Task); <see cref="WatermarkKey"/> is the per-candidate dedup key (the record id for a
/// Request, the TaskId for a Task) so two tasks on the same request nag independently.</summary>
public sealed class TriggerCandidateRow
{
    /// <summary>The fan-out target — the Request record id (for a Task candidate, its parent Request id).</summary>
    public string RecordId { get; set; } = string.Empty;
    /// <summary>The per-candidate fire/dedup key (record id for a Request, TaskId for a Task).</summary>
    public string? WatermarkKey { get; set; }
    /// <summary>The record's content-field map (JSON) — Authored candidates only; null for TaskOverdue.
    /// Confidential — never logged.</summary>
    public string? FieldValuesJson { get; set; }
    /// <summary>The task's assignee to notify — TaskOverdue candidates only; null for Authored.</summary>
    public Guid? AssigneeUserId { get; set; }
    /// <summary>The gate's frozen approver set (JSON) — ApprovalOverdue candidates only; null otherwise.
    /// The evaluator resolves the distinct eligible-member user ids from it. Confidential — never logged.</summary>
    public string? ApproverSetJson { get; set; }
}

/// <summary>A single fire watermark for a trigger — from usp_GetTriggerWatermarks.</summary>
public sealed class TriggerWatermarkRow
{
    public string RecordId { get; set; } = string.Empty;
    public DateTime LastFiredDate { get; set; }
}

/// <summary>Result of usp_TryBeginTriggerSweep — 1 when this caller claimed today's sweep, else 0.</summary>
public sealed class TriggerSweepClaimRow
{
    public bool Claimed { get; set; }
}

// ─── Trigger CRUD reads (Slice: triggers-request-authoring, Task 2.1) ──────────
/// <summary>One trigger for the admin list/editor — from usp_GetWorkspaceTriggers / usp_GetScheduledTriggerById.
/// Recipients + ConditionsJson are JSON, parsed in TriggersService.</summary>
public sealed class TriggerRow
{
    public Guid TriggerId { get; set; }
    public Guid WorkspaceId { get; set; }
    public string ObjectType { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsEnabled { get; set; }
    public string Cadence { get; set; } = string.Empty;
    public int? RepeatIntervalDays { get; set; }
    public int? WindowDays { get; set; }
    public string NotificationCategory { get; set; } = string.Empty;
    public string Recipients { get; set; } = "[]";
    public string NotificationTitle { get; set; } = string.Empty;
    public string NotificationBody { get; set; } = string.Empty;
    public string ConditionsJson { get; set; } = "[]";
}

/// <summary>The trigger id returned by usp_UpsertScheduledTrigger.</summary>
public sealed class TriggerIdRow
{
    public Guid TriggerId { get; set; }
}

/// <summary>The rows-affected count returned by usp_DeleteScheduledTrigger (0 = not found in workspace).</summary>
public sealed class TriggerDeleteResultRow
{
    public int RowsAffected { get; set; }
}
