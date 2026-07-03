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
