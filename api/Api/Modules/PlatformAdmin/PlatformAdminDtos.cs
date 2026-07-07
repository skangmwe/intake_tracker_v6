// Wire contracts for the platform-admin surfaces (Slice 19 — api-contracts §19, S35/S36/S37/S39).
// Property names serialize to camelCase (ASP.NET Core web defaults) so they mirror
// /shared/types/platform.ts. Every producing endpoint is gated on the caller's Platform-admin grant
// (BS §4.3). DisplayName / Email are PII — returned only to an entitled Platform admin, never logged
// (api-pii-handling.md).

using System.ComponentModel.DataAnnotations;

namespace McDermott.AiTracker.Api.Modules.PlatformAdmin;

/* ── S35 Crossing map (propose / confirm) ─────────────────────────────────── */

/// <summary>One crossing-map row (mirrors CrossingMapRowDto). A SEEDED row (Status='Seeded',
/// CrossingMapId=null) is an immutable 1:1 pair read off FieldDefinition; a DURABLE row
/// (Status='Proposed'|'Confirmed') comes from the CrossingMap table (slice 24).</summary>
public sealed record CrossingMapRowResponse(
    Guid? CrossingMapId,
    string SourceFieldKey,
    string SourceDisplayName,
    string SourceFieldType,
    string TargetFieldKey,
    string TargetDisplayName,
    string TargetFieldType,
    string Status,
    string? OptionCorrespondenceJson,
    string? ConfirmedByUserId,
    DateTime? ConfirmedAt);

/// <summary>Body for POST /platform/crossing-map — propose a PG→AI mapping. The proc validates
/// existence, type-compatibility, direction, one-to-one, and the option map (mirrors
/// CrossingMapProposeRequest).</summary>
public sealed class CrossingMapProposeRequest
{
    public Guid PgFieldDefinitionId { get; set; }

    public Guid AiFieldDefinitionId { get; set; }

    /// <summary>Optional select-type option map, serialized JSON (PG option value → AI option value).</summary>
    public string? OptionCorrespondenceJson { get; set; }
}

/// <summary>One mappable field for the S35 propose form (mirrors CrossingCandidateDto). Side is
/// 'PG' or 'AI'.</summary>
public sealed record CrossingCandidateResponse(
    Guid FieldDefinitionId, string Side, string FieldKey, string DisplayName, string FieldType);

/// <summary>Response for GET /platform/crossing-map/candidates (mirrors CrossingCandidatesDto).</summary>
public sealed record CrossingCandidatesResponse(
    IReadOnlyList<CrossingCandidateResponse> PgFields,
    IReadOnlyList<CrossingCandidateResponse> AiFields);

/* ── S37 Role-label catalog ───────────────────────────────────────────────── */

/// <summary>One platform-scope role label (mirrors RoleLabelDto).</summary>
public sealed record RoleLabelResponse(Guid RoleLabelId, string Label, int SortOrder);

/// <summary>Body for POST /platform/role-labels — add a label.</summary>
public sealed class RoleLabelCreateRequest
{
    [Required]
    [MaxLength(120)]
    public string? Label { get; set; }
}

/// <summary>Body for PATCH /platform/role-labels/{id} — rename (forward-only, BS §7.2).</summary>
public sealed class RoleLabelRenameRequest
{
    [Required]
    [MaxLength(120)]
    public string? Label { get; set; }
}

/* ── S36 Access provisioning ──────────────────────────────────────────────── */

/// <summary>One privileged grant in the S36 directory (mirrors PrivilegedGrantDto). Workspace fields
/// are null for a PlatformAdmin grant.</summary>
public sealed record PrivilegedGrantResponse(
    string GrantKind,
    Guid UserId,
    string DisplayName,
    string Email,
    Guid? WorkspaceId,
    string? WorkspaceName,
    DateTime GrantedAt);

/// <summary>Response for GET /platform/access.</summary>
public sealed record PrivilegedGrantsListResponse(IReadOnlyList<PrivilegedGrantResponse> Grants);

/// <summary>Body for POST /platform/access — grant the Platform-admin grant. Exactly one of
/// <see cref="UserId"/> / <see cref="Email"/> (the controller rejects both-or-neither with 400).</summary>
public sealed class PlatformAdminGrantRequest : IValidatableObject
{
    public Guid? UserId { get; set; }

    [MaxLength(320)]
    [EmailAddress(ErrorMessage = "Enter a valid email address.")]
    public string? Email { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        var hasUserId = UserId.HasValue;
        var hasEmail = !string.IsNullOrWhiteSpace(Email);
        if (hasUserId == hasEmail)
        {
            yield return new ValidationResult(
                "Supply exactly one of a user id or an email address.",
                new[] { nameof(UserId), nameof(Email) });
        }
    }
}

/* ── S39 Firm-wide audit ──────────────────────────────────────────────────── */

/// <summary>One firm-wide audit row (mirrors FirmWideAuditRowDto) — a workspace audit row plus the
/// workspace name for the cross-workspace feed.</summary>
public sealed record FirmWideAuditRowResponse(
    Guid AuditId,
    Guid WorkspaceId,
    string? WorkspaceName,
    string? RecordId,
    string? ObjectType,
    string EventType,
    Guid? ActorUserId,
    string? ActorName,
    DateTime EventAt,
    string Payload);

/// <summary>POST /platform/audit/query body (mirrors FirmWideAuditQuery). Every filter optional and
/// ANDed; omit <see cref="WorkspaceId"/> for the full cross-workspace feed. Paginated (default 20,
/// max 100 — api/CLAUDE.md).</summary>
public sealed class FirmWideAuditQueryRequest
{
    public Guid? WorkspaceId { get; set; }

    public DateOnly? DateFrom { get; set; }

    public DateOnly? DateTo { get; set; }

    public Guid? ActorUserId { get; set; }

    [MaxLength(20)]
    public string? RecordId { get; set; }

    [MaxLength(64)]
    public string? EventType { get; set; }

    [Range(1, int.MaxValue)]
    public int Page { get; set; } = 1;

    [Range(1, int.MaxValue)]
    public int PageSize { get; set; } = 20;
}
