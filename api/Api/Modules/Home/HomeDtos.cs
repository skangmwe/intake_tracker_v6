// Home surface DTOs (Slice 22 — api-contracts.md §16). Mirror shared/types/home.ts. Serialized with
// the API's Web JSON defaults (camelCase). The composite HomeDto is assembled by HomeService from five
// viewer-scoped reads. DateTime members carry Kind=Utc so they serialize as ISO-8601 with a Z.

namespace McDermott.AiTracker.Api.Modules.Home;

/// <summary>"Needs your decision" — an open gate where the caller is an eligible, unsigned slot member.</summary>
public sealed record HomeDecisionItem(
    string RecordId, string Name, string GateLabel, string RoleLabel, DateTime OpenedAt);

/// <summary>"Your work today" — a record the caller owns, urgency-ordered. DueDate is an ISO date (no time).</summary>
public sealed record HomeWorkItem(
    string RecordId, string Name, string StageLabel, string Origin, string? DueDate, string? SlaStatus);

/// <summary>"Since you were last here" — an audit event on a visible record since the caller's prior visit.</summary>
public sealed record HomeActivityItem(
    string? RecordId, string Name, string EventType, string? ActorName, DateTime EventAt);

/// <summary>"New to triage" — an unassigned record awaiting an analyst.</summary>
public sealed record HomeTriageItem(string RecordId, string Name, string Origin, DateTime ReceivedAt);

/// <summary>A pinned, published announcement for the Home slim strip.</summary>
public sealed record HomePinnedAnnouncement(
    Guid AnnouncementId, string Title, string BodySnippet, DateTime? PublishedAt);

/// <summary>The composite Home payload (BS §10.7). Panels are capped server-side; counts are the full match.</summary>
public sealed record HomeDto(
    Guid WorkspaceId,
    IReadOnlyList<HomeDecisionItem> Decisions,
    int DecisionCount,
    IReadOnlyList<HomeWorkItem> Work,
    int WorkCount,
    IReadOnlyList<HomeActivityItem> Activity,
    DateTime? SinceLastSeenAt,
    IReadOnlyList<HomeTriageItem> Triage,
    int TriageCount,
    IReadOnlyList<HomePinnedAnnouncement> PinnedAnnouncements);
