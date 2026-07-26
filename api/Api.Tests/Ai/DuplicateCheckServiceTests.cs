using System.Text.Json;
using McDermott.AiTracker.Api.Modules.Ai.Config;
using McDermott.AiTracker.Api.Modules.Ai.Duplicates;
using McDermott.AiTracker.Api.Modules.Ai.Providers;
using McDermott.AiTracker.Api.Modules.Ai.Retrieval;
using McDermott.AiTracker.Api.Modules.Closure;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Modules.TypedLinks;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public class DuplicateCheckServiceTests
{
    private const string SubjectId = "LIT-9004";
    private static readonly Guid WorkspaceId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly IReadOnlyList<string> Allowlist = new[] { "Name", "Description", "WorkflowDetails" };

    private readonly Mock<IAiConfigService> _config = new();
    private readonly Mock<IEmbeddingService> _embeddings = new();
    private readonly Mock<IRecordRetriever> _retriever = new();
    private readonly Mock<IRequestsService> _requests = new();
    private readonly Mock<ILlmProviderFactory> _factory = new();
    private readonly Mock<ITypedLinksService> _typedLinks = new();
    private readonly Mock<IClosureService> _closure = new();
    private readonly Mock<IAccessGuard> _accessGuard = new();

    private DuplicateCheckService Build() => new(
        _config.Object, _embeddings.Object, _retriever.Object, _requests.Object, _factory.Object,
        _typedLinks.Object, _closure.Object, _accessGuard.Object, NullLogger<DuplicateCheckService>.Instance);

    private void EnableWorkspace() =>
        _config.Setup(config => config.GetAsync(WorkspaceId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiConfigDto(true, Allowlist));

    private void SeedRetrieval(params RetrievedRecord[] records) =>
        _retriever
            .Setup(retriever => retriever.RetrieveAsync(
                WorkspaceId, UserId, It.IsAny<string>(), It.IsAny<float[]>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(records);

    private void SeedEmbedding() =>
        _embeddings.Setup(embed => embed.EmbedAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { 0.1f, 0.2f });

    private void SeedRecord(string id, string name, string description, string fieldsJson = "{}") =>
        _requests.Setup(requests => requests.GetByIdAsync(id, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(BuildRecord(id, name, description, fieldsJson));

    private FakeProvider UseProvider(FakeProvider provider)
    {
        _factory.Setup(factory => factory.Get(It.IsAny<string?>())).Returns(provider);
        return provider;
    }

    // ─── CheckAsync ────────────────────────────────────────────────────────────

    [Fact]
    public async Task Check_RanksMatches_ExcludesSelf()
    {
        // Arrange - retrieval returns two real matches plus the subject's own id, all above threshold.
        EnableWorkspace();
        SeedEmbedding();
        SeedRecord(SubjectId, "Onboard Acme", "Onboard Acme's litigation team");
        SeedRecord("LIT-9010", "Acme onboarding", "Set up Acme litigation workspace");
        SeedRecord("LIT-9011", "Acme intake", "Intake for Acme litigation");
        SeedRetrieval(
            new RetrievedRecord("LIT-9010", "Acme onboarding", 0.92),
            new RetrievedRecord(SubjectId, "Onboard Acme", 0.99),
            new RetrievedRecord("LIT-9011", "Acme intake", 0.81));
        UseProvider(new FakeProvider("Both describe onboarding the same Acme litigation team."));
        var sut = Build();

        // Act
        var result = await sut.CheckAsync(WorkspaceId, UserId, SubjectId, CancellationToken.None);

        // Assert - self excluded, ranked order preserved, each match carries a rationale.
        Assert.Equal(new[] { "LIT-9010", "LIT-9011" }, result.Select(candidate => candidate.RecordId));
        Assert.All(result, candidate => Assert.False(string.IsNullOrWhiteSpace(candidate.Rationale)));
    }

    [Fact]
    public async Task Check_BelowThreshold_Dropped()
    {
        // Arrange - one match clears the threshold, one falls below it.
        EnableWorkspace();
        SeedEmbedding();
        SeedRecord(SubjectId, "Onboard Acme", "Onboard Acme's litigation team");
        SeedRecord("LIT-9010", "Acme onboarding", "Set up Acme litigation workspace");
        SeedRetrieval(
            new RetrievedRecord("LIT-9010", "Acme onboarding", 0.90),
            new RetrievedRecord("LIT-9099", "Unrelated matter", 0.40));
        UseProvider(new FakeProvider("Same Acme onboarding request."));
        var sut = Build();

        // Act
        var result = await sut.CheckAsync(WorkspaceId, UserId, SubjectId, CancellationToken.None);

        // Assert - the weak match is dropped and never loads or asks the provider.
        Assert.Equal(new[] { "LIT-9010" }, result.Select(candidate => candidate.RecordId));
        _requests.Verify(requests => requests.GetByIdAsync("LIT-9099", UserId, It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Check_NoCandidates_ReturnsEmpty()
    {
        // Arrange - retrieval finds nothing.
        EnableWorkspace();
        SeedEmbedding();
        SeedRecord(SubjectId, "Onboard Acme", "Onboard Acme's litigation team");
        SeedRetrieval();
        var provider = UseProvider(new FakeProvider("unused"));
        var sut = Build();

        // Act
        var result = await sut.CheckAsync(WorkspaceId, UserId, SubjectId, CancellationToken.None);

        // Assert - empty, and no provider call.
        Assert.Empty(result);
        Assert.Equal(0, provider.CompleteCalls);
    }

    [Fact]
    public async Task Check_Disabled_ReturnsEmpty_NoRetrieval()
    {
        // Arrange - AI assist off for the workspace.
        _config.Setup(config => config.GetAsync(WorkspaceId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiConfigDto(false, Allowlist));
        var sut = Build();

        // Act
        var result = await sut.CheckAsync(WorkspaceId, UserId, SubjectId, CancellationToken.None);

        // Assert - empty, and nothing downstream ran.
        Assert.Empty(result);
        _requests.Verify(requests => requests.GetByIdAsync(It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
        _embeddings.Verify(embed => embed.EmbedAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Check_SubjectNotVisible_ReturnsEmpty()
    {
        // Arrange - the subject cannot be seen by the caller.
        EnableWorkspace();
        _requests.Setup(requests => requests.GetByIdAsync(SubjectId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((RequestDto?)null);
        var sut = Build();

        // Act
        var result = await sut.CheckAsync(WorkspaceId, UserId, SubjectId, CancellationToken.None);

        // Assert - empty, and retrieval never ran.
        Assert.Empty(result);
        _embeddings.Verify(embed => embed.EmbedAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Check_SubjectHasNoAllowlistedContent_ReturnsEmpty()
    {
        // Arrange - the subject's allowlisted fields are all blank; there is nothing to compare on.
        EnableWorkspace();
        SeedRecord(SubjectId, string.Empty, string.Empty);
        var sut = Build();

        // Act
        var result = await sut.CheckAsync(WorkspaceId, UserId, SubjectId, CancellationToken.None);

        // Assert - empty, and no embedding / retrieval.
        Assert.Empty(result);
        _embeddings.Verify(embed => embed.EmbedAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Check_CandidateNotVisible_Skipped()
    {
        // Arrange - a retrieved candidate is not readable on the per-record re-check.
        EnableWorkspace();
        SeedEmbedding();
        SeedRecord(SubjectId, "Onboard Acme", "Onboard Acme's litigation team");
        _requests.Setup(requests => requests.GetByIdAsync("LIT-9010", UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((RequestDto?)null);
        SeedRetrieval(new RetrievedRecord("LIT-9010", "Acme onboarding", 0.90));
        var provider = UseProvider(new FakeProvider("unused"));
        var sut = Build();

        // Act
        var result = await sut.CheckAsync(WorkspaceId, UserId, SubjectId, CancellationToken.None);

        // Assert - the unreadable candidate is skipped; no rationale is generated for it.
        Assert.Empty(result);
        Assert.Equal(0, provider.CompleteCalls);
    }

    [Fact]
    public async Task Check_ProviderThrows_NoRetry()
    {
        // Arrange - a permanent provider failure while building a rationale.
        EnableWorkspace();
        SeedEmbedding();
        SeedRecord(SubjectId, "Onboard Acme", "Onboard Acme's litigation team");
        SeedRecord("LIT-9010", "Acme onboarding", "Set up Acme litigation workspace");
        SeedRetrieval(new RetrievedRecord("LIT-9010", "Acme onboarding", 0.90));
        var provider = UseProvider(new FakeProvider(null, throws: true));
        var sut = Build();

        // Act + Assert - the error propagates once, with no retry.
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            sut.CheckAsync(WorkspaceId, UserId, SubjectId, CancellationToken.None));
        Assert.Equal(1, provider.CompleteCalls);
    }

    [Fact]
    public async Task Check_Cancellation_StopsCleanly()
    {
        // Arrange - a pre-cancelled token.
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        var sut = Build();

        // Act + Assert - exits with a cancellation, and nothing downstream ran.
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            sut.CheckAsync(WorkspaceId, UserId, SubjectId, cts.Token));
        _config.Verify(config => config.GetAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Check_OnlyAllowlistedContentInRationalePrompt()
    {
        // Arrange - both records carry an off-allowlist client-matter value in their fields; assert it never
        // reaches the provider, while the allowlisted content does.
        EnableWorkspace();
        SeedEmbedding();
        SeedRecord(SubjectId, "Onboard Acme", "weekly review", "{\"clientNumber\":\"MATTER-123-SECRET\"}");
        SeedRecord("LIT-9010", "Acme onboarding", "monthly sync", "{\"clientNumber\":\"MATTER-999-SECRET\"}");
        SeedRetrieval(new RetrievedRecord("LIT-9010", "Acme onboarding", 0.90));
        var provider = UseProvider(new FakeProvider("Same Acme onboarding request."));
        var sut = Build();

        // Act
        await sut.CheckAsync(WorkspaceId, UserId, SubjectId, CancellationToken.None);

        // Assert
        var prompt = provider.LastRequest!.System + " " +
            string.Join(" ", provider.LastRequest.Messages.Select(message => message.Content));
        Assert.Contains("weekly review", prompt);
        Assert.Contains("monthly sync", prompt);
        Assert.DoesNotContain("MATTER-123-SECRET", prompt);
        Assert.DoesNotContain("MATTER-999-SECRET", prompt);
    }

    // ─── ConfirmAsync ──────────────────────────────────────────────────────────

    private void GrantMember(Guid workspaceId) =>
        _accessGuard.Setup(guard => guard.HasWorkspaceLevelAsync(
                UserId, workspaceId, WorkspaceLevel.Member, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

    private void SeedLinkCreated() =>
        _typedLinks.Setup(links => links.AddLinkAsync(
                It.IsAny<string>(), It.IsAny<AddLinkRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AddLinkResult(AddLinkOutcome.Created));

    private void SeedCloseSuccess() =>
        _closure.Setup(closure => closure.CloseAsync(
                It.IsAny<string>(), It.IsAny<RequestCloseRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CloseResult(CloseOutcome.Success));

    [Fact]
    public async Task Confirm_Happy_LinksAndCloses()
    {
        // Arrange - subject + target visible, caller is a Member, link + close succeed.
        SeedRecord(SubjectId, "Onboard Acme", "Onboard Acme's litigation team");
        SeedRecord("LIT-9010", "Acme onboarding", "Set up Acme litigation workspace");
        GrantMember(WorkspaceId);
        SeedLinkCreated();
        SeedCloseSuccess();
        var sut = Build();

        // Act
        var result = await sut.ConfirmAsync(WorkspaceId, UserId, SubjectId, "LIT-9010", "Same request.", "op-1", CancellationToken.None);

        // Assert - confirmed, with the duplicate-of link and Duplicate close both invoked with the right ids.
        Assert.Equal(ConfirmDuplicateOutcome.Confirmed, result.Outcome);
        _typedLinks.Verify(links => links.AddLinkAsync(
            SubjectId,
            It.Is<AddLinkRequest>(request => request.ToRecordId == "LIT-9010" && request.Kind == "duplicate-of" && request.Rationale == "Same request."),
            UserId, "op-1", It.IsAny<CancellationToken>()), Times.Once);
        _closure.Verify(closure => closure.CloseAsync(
            SubjectId,
            It.Is<RequestCloseRequest>(request => request.Outcome!.Value == "Duplicate" && request.Outcome.DuplicateOfRecordId == "LIT-9010" && request.Outcome.Notes == "Same request."),
            UserId, "op-1", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Confirm_SubjectNotVisible_Denied()
    {
        // Arrange - the subject cannot be seen.
        _requests.Setup(requests => requests.GetByIdAsync(SubjectId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((RequestDto?)null);
        var sut = Build();

        // Act
        var result = await sut.ConfirmAsync(WorkspaceId, UserId, SubjectId, "LIT-9010", "r", "op-1", CancellationToken.None);

        // Assert - denied, and nothing was linked or closed.
        Assert.Equal(ConfirmDuplicateOutcome.SubjectDenied, result.Outcome);
        VerifyNoWrite();
    }

    [Fact]
    public async Task Confirm_NotMember_Denied()
    {
        // Arrange - subject visible but the caller is only a Viewer on its workspace.
        SeedRecord(SubjectId, "Onboard Acme", "Onboard Acme");
        _accessGuard.Setup(guard => guard.HasWorkspaceLevelAsync(
                UserId, WorkspaceId, WorkspaceLevel.Member, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);
        var sut = Build();

        // Act
        var result = await sut.ConfirmAsync(WorkspaceId, UserId, SubjectId, "LIT-9010", "r", "op-1", CancellationToken.None);

        // Assert
        Assert.Equal(ConfirmDuplicateOutcome.SubjectDenied, result.Outcome);
        VerifyNoWrite();
    }

    [Fact]
    public async Task Confirm_TargetMissing_Invalid()
    {
        // Arrange - subject visible + Member, but the duplicate target cannot be seen.
        SeedRecord(SubjectId, "Onboard Acme", "Onboard Acme");
        GrantMember(WorkspaceId);
        _requests.Setup(requests => requests.GetByIdAsync("LIT-9010", UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((RequestDto?)null);
        var sut = Build();

        // Act
        var result = await sut.ConfirmAsync(WorkspaceId, UserId, SubjectId, "LIT-9010", "r", "op-1", CancellationToken.None);

        // Assert
        Assert.Equal(ConfirmDuplicateOutcome.TargetInvalid, result.Outcome);
        VerifyNoWrite();
    }

    [Fact]
    public async Task Confirm_TargetIsSelf_Invalid()
    {
        // Arrange - the target is the subject itself.
        SeedRecord(SubjectId, "Onboard Acme", "Onboard Acme");
        GrantMember(WorkspaceId);
        var sut = Build();

        // Act
        var result = await sut.ConfirmAsync(WorkspaceId, UserId, SubjectId, SubjectId, "r", "op-1", CancellationToken.None);

        // Assert
        Assert.Equal(ConfirmDuplicateOutcome.TargetInvalid, result.Outcome);
        VerifyNoWrite();
    }

    [Fact]
    public async Task Confirm_LinkInvalid_Invalid_DoesNotClose()
    {
        // Arrange - the duplicate-of link is rejected (e.g. cross-family target).
        SeedRecord(SubjectId, "Onboard Acme", "Onboard Acme");
        SeedRecord("LIT-9010", "Acme onboarding", "Set up Acme");
        GrantMember(WorkspaceId);
        _typedLinks.Setup(links => links.AddLinkAsync(
                It.IsAny<string>(), It.IsAny<AddLinkRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AddLinkResult(AddLinkOutcome.Invalid));
        var sut = Build();

        // Act
        var result = await sut.ConfirmAsync(WorkspaceId, UserId, SubjectId, "LIT-9010", "r", "op-1", CancellationToken.None);

        // Assert - a rejected link never leaves a closed-but-unlinked record.
        Assert.Equal(ConfirmDuplicateOutcome.TargetInvalid, result.Outcome);
        _closure.Verify(closure => closure.CloseAsync(
            It.IsAny<string>(), It.IsAny<RequestCloseRequest>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Confirm_CloseDenied_Denied()
    {
        // Arrange - link succeeds but the close is denied.
        SeedRecord(SubjectId, "Onboard Acme", "Onboard Acme");
        SeedRecord("LIT-9010", "Acme onboarding", "Set up Acme");
        GrantMember(WorkspaceId);
        SeedLinkCreated();
        _closure.Setup(closure => closure.CloseAsync(
                It.IsAny<string>(), It.IsAny<RequestCloseRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CloseResult(CloseOutcome.Denied));
        var sut = Build();

        // Act
        var result = await sut.ConfirmAsync(WorkspaceId, UserId, SubjectId, "LIT-9010", "r", "op-1", CancellationToken.None);

        // Assert
        Assert.Equal(ConfirmDuplicateOutcome.SubjectDenied, result.Outcome);
    }

    [Fact]
    public async Task Confirm_Cancellation_StopsCleanly()
    {
        // Arrange - a pre-cancelled token.
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        var sut = Build();

        // Act + Assert - exits with a cancellation, and nothing was read or written.
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            sut.ConfirmAsync(WorkspaceId, UserId, SubjectId, "LIT-9010", "r", "op-1", cts.Token));
        _requests.Verify(requests => requests.GetByIdAsync(It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    private void VerifyNoWrite()
    {
        _typedLinks.Verify(links => links.AddLinkAsync(
            It.IsAny<string>(), It.IsAny<AddLinkRequest>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        _closure.Verify(closure => closure.CloseAsync(
            It.IsAny<string>(), It.IsAny<RequestCloseRequest>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    private static RequestDto BuildRecord(string id, string name, string description, string fieldsJson)
    {
        using var document = JsonDocument.Parse(fieldsJson);
        var fields = document.RootElement.EnumerateObject()
            .ToDictionary(property => property.Name, property => property.Value.Clone());

        return new RequestDto(
            Id: id,
            WorkspaceId: WorkspaceId,
            Origin: "AiSolutions",
            CreatedAt: DateTime.UtcNow,
            UpdatedAt: DateTime.UtcNow,
            CreatedBy: "seed",
            UpdatedBy: "seed",
            LegacyId: null,
            LifecycleId: Guid.NewGuid(),
            LifecycleName: "Standard delivery",
            Stages: Array.Empty<RequestStageRef>(),
            Stage: null,
            StatusHold: default,
            StatusHoldNote: null,
            Hold: null,
            Outcome: null,
            DisplayStatus: "Open",
            SlaStatus: null,
            TimeInStage: null,
            Name: name,
            Description: description,
            Fields: fields,
            Bridge: null,
            ETag: "etag");
    }

    private sealed class FakeProvider : ILlmProvider
    {
        private readonly string? _response;
        private readonly bool _throws;

        public FakeProvider(string? response, bool throws = false)
        {
            _response = response;
            _throws = throws;
        }

        public LlmRequest? LastRequest { get; private set; }

        public int CompleteCalls { get; private set; }

        public string Name => "claude";

        public IAsyncEnumerable<LlmToken> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException("The duplicate check uses the non-streaming path.");

        public Task<LlmCompletion> CompleteAsync(LlmRequest request, int maxTokens, CancellationToken ct)
        {
            CompleteCalls++;
            LastRequest = request;
            if (_throws)
            {
                throw new InvalidOperationException("provider failure");
            }

            return Task.FromResult(new LlmCompletion(_response!));
        }
    }
}
