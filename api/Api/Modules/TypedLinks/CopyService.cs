// Copy service (Slice 10 — api-contracts.md §9, BS §5). Copies a record into a fresh personal Draft
// in a target workspace and returns the draft id. The source is read on the caller's side
// (usp_GetRequestByIdForUser via IRequestsService) — forbidden OR non-existent → 403 (BS §22.6); the
// caller must also be a Member+ of the target workspace (they will submit the draft there). The new
// draft is unlinked and fresh: no outcome, no hold, no stage, no system fields — a link back to the
// source (BS §5) is queued on the draft and stamped as a typed link when the draft is submitted
// (usp_CreateRequest). `includeAttachments` is accepted but a no-op until the Attachments object
// exists (slice 11). Field values are Confidential — never logged (api-pii-handling.md).

using System.Text.Json;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;

namespace McDermott.AiTracker.Api.Modules.TypedLinks;

public enum CopyOutcome
{
    Success,
    /// <summary>The source record is not visible to the caller (403, never disclose existence).</summary>
    DeniedSource,
    /// <summary>The caller is not a Member+ of the target workspace (403).</summary>
    DeniedTarget,
}

public sealed record CopyServiceResult(CopyOutcome Outcome, Guid? DraftId = null);

public interface ICopyService
{
    Task<CopyServiceResult> CopyAsync(
        string recordId, CopyRequest request, Guid actorUserId, CancellationToken cancellationToken);
}

public sealed class CopyService : ICopyService
{
    /// <summary>Field keys stripped from a copy — a fresh draft carries no outcome, hold, stage, or
    /// system-field state (BS §5). Everything else is copied same-field-identity (the Phase 1 crossing
    /// map is 1:1 same-key, so this doubles as the crossing map for a cross-workspace copy).</summary>
    private static readonly HashSet<string> StrippedKeys = new(StringComparer.Ordinal)
    {
        "outcome", "outcomeKind", "outcomeNotes", "duplicateOfRecordId",
        "holdBlocked", "holdReason", "stage",
        "ai-solutions-status", "record-id", "workspace", "origin", "created-at", "updated-at",
    };

    private readonly IRequestsService _requests;
    private readonly IDraftsService _drafts;
    private readonly IAccessGuard _accessGuard;

    public CopyService(IRequestsService requests, IDraftsService drafts, IAccessGuard accessGuard)
    {
        _requests = requests;
        _drafts = drafts;
        _accessGuard = accessGuard;
    }

    public async Task<CopyServiceResult> CopyAsync(
        string recordId, CopyRequest request, Guid actorUserId, CancellationToken cancellationToken)
    {
        var source = await _requests.GetByIdAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (source is null)
        {
            return new CopyServiceResult(CopyOutcome.DeniedSource);
        }

        if (!await _accessGuard.HasWorkspaceLevelAsync(actorUserId, request.TargetWorkspaceId, WorkspaceLevel.Member, cancellationToken).ConfigureAwait(false))
        {
            return new CopyServiceResult(CopyOutcome.DeniedTarget);
        }

        var fields = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var entry in source.Fields)
        {
            if (!StrippedKeys.Contains(entry.Key))
            {
                fields[entry.Key] = entry.Value;
            }
        }

        var queuedLinks = request.LinkBackKind is { Length: > 0 } kind
            ? new List<QueuedLinkInput> { new() { ToRecordId = recordId, Kind = kind } }
            : null;

        var save = new DraftSaveRequest
        {
            ObjectType = "Request",
            Title = source.Name,
            Body = new DraftBodyInput { Fields = fields, QueuedLinks = queuedLinks },
        };

        var result = await _drafts
            .SaveAsync(request.TargetWorkspaceId, actorUserId, save, cancellationToken)
            .ConfigureAwait(false);

        return new CopyServiceResult(CopyOutcome.Success, result.Draft.Id);
    }
}
