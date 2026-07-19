// Unit tests for CopyService (Slice 10 — Copy, BS §5). CopyService has no DbContext — it composes
// IRequestsService (read the source), IAccessGuard (target-workspace gate), and IDraftsService (persist
// the draft), all mocked. Covers: 403 when the source isn't visible, 403 when the caller can't create
// in the target workspace, the happy path (stripped fields + queued link-back), and cancellation.

using System.Text.Json;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Modules.TypedLinks;
using McDermott.AiTracker.Api.Shared.Auth;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class CopyServiceTests
{
    private static readonly Guid ActorId = Guid.NewGuid();
    private static readonly Guid SourceWorkspaceId = new("B0000000-0000-4000-8000-000000000001");
    private static readonly Guid TargetWorkspaceId = new("B0000000-0000-4000-8000-000000000002");
    private static readonly Guid NewDraftId = new("D0000000-0000-4000-8000-0000000000AA");
    private const string RecordId = "AIS-00000005";

    private readonly Mock<IRequestsService> _requests = new();
    private readonly Mock<IDraftsService> _drafts = new();
    private readonly Mock<IAccessGuard> _accessGuard = new();

    public CopyServiceTests()
    {
        _accessGuard
            .Setup(guard => guard.HasWorkspaceLevelAsync(ActorId, TargetWorkspaceId, WorkspaceLevel.Member, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        _drafts
            .Setup(service => service.SaveAsync(It.IsAny<Guid>(), ActorId, It.IsAny<DraftSaveRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid workspaceId, Guid _, DraftSaveRequest _, CancellationToken _) =>
                new DraftSaveResult(
                    new DraftDto(NewDraftId, workspaceId, "Request", "Copy", new DraftBodyDto(new Dictionary<string, JsonElement>(), null), DateTime.UtcNow),
                    Created: true));
    }

    private CopyService Build() => new(_requests.Object, _drafts.Object, _accessGuard.Object);

    private static RequestDto Source(IReadOnlyDictionary<string, JsonElement>? fields = null) =>
        new(
            Id: RecordId,
            WorkspaceId: SourceWorkspaceId,
            Origin: "AI Solutions",
            CreatedAt: DateTime.UtcNow,
            UpdatedAt: DateTime.UtcNow,
            CreatedBy: "seed",
            UpdatedBy: "seed",
            LegacyId: null,
            LifecycleId: Guid.NewGuid(),
            Stages: Array.Empty<RequestStageRef>(),
            Stage: "build",
            StatusHold: RequestStatusHoldValue.InProgress,
            StatusHoldNote: null,
            Hold: new HoldState(false, null),
            Outcome: null,
            DisplayStatus: "Build",
            SlaStatus: null,
            TimeInStage: null,
            Name: "Meeting-notes extractor",
            Description: "Pull actions from meetings.",
            Fields: fields ?? new Dictionary<string, JsonElement>(StringComparer.Ordinal),
            Bridge: null,
            ETag: "AAAAAAAAAGQ=");

    private void SetupSource(RequestDto? record) =>
        _requests.Setup(service => service.GetByIdAsync(RecordId, ActorId, It.IsAny<CancellationToken>())).ReturnsAsync(record);

    private static Dictionary<string, JsonElement> Fields(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;

    [Fact]
    public async Task CopyAsync_SourceNotVisible_ReturnsDeniedSource()
    {
        // Arrange — a forbidden or non-existent source both read as null (403, never 404).
        SetupSource(null);
        var request = new CopyRequest { TargetWorkspaceId = TargetWorkspaceId, IncludeAttachments = false };

        // Act
        var result = await Build().CopyAsync(RecordId, request, ActorId, CancellationToken.None);

        // Assert
        Assert.Equal(CopyOutcome.DeniedSource, result.Outcome);
    }

    [Fact]
    public async Task CopyAsync_NotMemberOfTarget_ReturnsDeniedTarget()
    {
        // Arrange — the source is visible but the caller cannot create in the target workspace.
        SetupSource(Source());
        _accessGuard
            .Setup(guard => guard.HasWorkspaceLevelAsync(ActorId, TargetWorkspaceId, WorkspaceLevel.Member, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);
        var request = new CopyRequest { TargetWorkspaceId = TargetWorkspaceId, IncludeAttachments = false };

        // Act
        var result = await Build().CopyAsync(RecordId, request, ActorId, CancellationToken.None);

        // Assert
        Assert.Equal(CopyOutcome.DeniedTarget, result.Outcome);
    }

    [Fact]
    public async Task CopyAsync_HappyPath_StripsOutcomeAndQueuesLinkBack()
    {
        // Arrange — a closed, held source; the copy must drop outcome/hold/stage and queue a re-pursuit link.
        SetupSource(Source(Fields("""
            { "name": "Meeting-notes extractor", "stage": "deploy", "outcome": "Live", "holdBlocked": "true", "businessValue": 4 }
            """)));
        DraftSaveRequest? captured = null;
        _drafts
            .Setup(service => service.SaveAsync(TargetWorkspaceId, ActorId, It.IsAny<DraftSaveRequest>(), It.IsAny<CancellationToken>()))
            .Callback((Guid _, Guid _, DraftSaveRequest req, CancellationToken _) => captured = req)
            .ReturnsAsync(new DraftSaveResult(
                new DraftDto(NewDraftId, TargetWorkspaceId, "Request", "Copy", new DraftBodyDto(new Dictionary<string, JsonElement>(), null), DateTime.UtcNow),
                Created: true));
        var request = new CopyRequest { TargetWorkspaceId = TargetWorkspaceId, IncludeAttachments = true, LinkBackKind = "re-pursuit-of" };

        // Act
        var result = await Build().CopyAsync(RecordId, request, ActorId, CancellationToken.None);

        // Assert
        Assert.Equal(CopyOutcome.Success, result.Outcome);
        Assert.Equal(NewDraftId, result.DraftId);
        Assert.NotNull(captured);
        Assert.False(captured!.Body!.Fields!.ContainsKey("outcome"), "outcome must be stripped from a copy");
        Assert.False(captured.Body.Fields!.ContainsKey("holdBlocked"), "hold must be stripped from a copy");
        Assert.False(captured.Body.Fields!.ContainsKey("stage"), "stage must be stripped from a copy");
        Assert.True(captured.Body.Fields!.ContainsKey("businessValue"), "content fields must copy across");
        var link = Assert.Single(captured.Body.QueuedLinks!);
        Assert.Equal(RecordId, link.ToRecordId);
        Assert.Equal("re-pursuit-of", link.Kind);
    }

    [Fact]
    public async Task CopyAsync_Cancellation_Propagates()
    {
        // Arrange
        _requests
            .Setup(service => service.GetByIdAsync(RecordId, ActorId, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        var request = new CopyRequest { TargetWorkspaceId = TargetWorkspaceId, IncludeAttachments = false };

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(
            () => Build().CopyAsync(RecordId, request, ActorId, cts.Token));
    }
}
