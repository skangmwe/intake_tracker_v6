// Unit tests for ApprovalsController (routing / status-code mapping only — the service is mocked) plus
// the pure ApprovalsService.ParseJson helper. Covers list 200/403, decision 200 / 400 (reject-needs-
// comment, ineligible, unknown-slot) / 403 / 409 (already-resolved), the proxy path (isProxy = true),
// re-request 200/403, cancellation propagation, and the FrozenApproverSet / DecisionsJson parsing
// (api-testing-guidelines.md).

using McDermott.AiTracker.Api.Modules.Gates;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class ApprovalsControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid ApprovalRequestId = Guid.NewGuid();
    private const string RecordId = "AI-00000042";

    private static ApprovalsController Build(Mock<IApprovalsService> approvals)
    {
        var currentUser = new Mock<McDermott.AiTracker.Api.Shared.Auth.ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        var httpContext = new DefaultHttpContext();
        httpContext.Items[OperationIdMiddleware.HeaderName] = "op-1";

        return new ApprovalsController(approvals.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
    }

    private static ApprovalRequestDto SampleGate(string state = "Pending") => new(
        Id: ApprovalRequestId.ToString(),
        RequestRecordId: RecordId,
        GateDefinitionId: Guid.NewGuid().ToString(),
        GateName: "QA readiness gate",
        FromStage: "Build",
        ToStage: "QA",
        State: state,
        OpenedAt: DateTime.UtcNow,
        ResolvedAt: null,
        Slots: Array.Empty<FrozenApproverSlotDto>(),
        Decisions: Array.Empty<ApprovalDecisionDto>());

    private static ApprovalDecisionRequest Approve() =>
        new() { SlotIndex = 0, DecidedByUserId = Guid.NewGuid(), Decision = "Approved" };

    [Fact]
    public async Task GetApprovalRequests_Accessible_ReturnsOk()
    {
        // Arrange
        var gates = new List<ApprovalRequestDto> { SampleGate() };
        var approvals = new Mock<IApprovalsService>();
        approvals.Setup(service => service.GetForRecordAsync(RecordId, UserId, It.IsAny<CancellationToken>())).ReturnsAsync(gates);

        // Act
        var result = await Build(approvals).GetApprovalRequests(RecordId, CancellationToken.None);

        // Assert
        Assert.Same(gates, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task GetApprovalRequests_NoAccess_Returns403()
    {
        // Arrange — null distinguishes "cannot see the record" (403) from "no gates" (empty 200).
        var approvals = new Mock<IApprovalsService>();
        approvals.Setup(service => service.GetForRecordAsync(RecordId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((IReadOnlyList<ApprovalRequestDto>?)null);

        // Act
        var result = await Build(approvals).GetApprovalRequests(RecordId, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task SubmitDecision_Success_ReturnsOk()
    {
        // Arrange
        var gate = SampleGate("Resolved");
        var approvals = new Mock<IApprovalsService>();
        approvals.Setup(service => service.SubmitDecisionAsync(ApprovalRequestId, It.IsAny<ApprovalDecisionRequest>(), UserId, false, "op-1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ApprovalDecisionResult(ApprovalDecisionOutcome.Success, gate));

        // Act
        var result = await Build(approvals).SubmitDecision(ApprovalRequestId, Approve(), CancellationToken.None);

        // Assert
        Assert.Same(gate, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Theory]
    [InlineData(ApprovalDecisionOutcome.RejectionNeedsComment, StatusCodes.Status400BadRequest)]
    [InlineData(ApprovalDecisionOutcome.Ineligible, StatusCodes.Status400BadRequest)]
    [InlineData(ApprovalDecisionOutcome.UnknownSlot, StatusCodes.Status400BadRequest)]
    [InlineData(ApprovalDecisionOutcome.Invalid, StatusCodes.Status400BadRequest)]
    [InlineData(ApprovalDecisionOutcome.AlreadyResolved, StatusCodes.Status409Conflict)]
    [InlineData(ApprovalDecisionOutcome.Forbidden, StatusCodes.Status403Forbidden)]
    [InlineData(ApprovalDecisionOutcome.RecordOnHold, StatusCodes.Status409Conflict)]
    public async Task SubmitDecision_MapsOutcomeToStatus(ApprovalDecisionOutcome outcome, int expectedStatus)
    {
        // Arrange
        var approvals = new Mock<IApprovalsService>();
        approvals.Setup(service => service.SubmitDecisionAsync(ApprovalRequestId, It.IsAny<ApprovalDecisionRequest>(), UserId, false, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ApprovalDecisionResult(outcome));

        // Act
        var result = await Build(approvals).SubmitDecision(ApprovalRequestId, Approve(), CancellationToken.None);

        // Assert
        Assert.Equal(expectedStatus, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task ProxyDecision_CallsServiceWithIsProxyTrue()
    {
        // Arrange
        var approvals = new Mock<IApprovalsService>();
        approvals.Setup(service => service.SubmitDecisionAsync(ApprovalRequestId, It.IsAny<ApprovalDecisionRequest>(), UserId, true, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ApprovalDecisionResult(ApprovalDecisionOutcome.Success, SampleGate("Resolved")));
        var request = new ProxyApprovalDecisionRequest { SlotIndex = 0, DecidedByUserId = Guid.NewGuid(), Decision = "Approved", ProxyContext = "Signed in the QA review meeting" };

        // Act
        var result = await Build(approvals).ProxyDecision(ApprovalRequestId, request, CancellationToken.None);

        // Assert — routed as a proxy (isProxy: true), never as a normal decision.
        Assert.IsType<OkObjectResult>(result);
        approvals.Verify(service => service.SubmitDecisionAsync(ApprovalRequestId, request, UserId, true, It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
        approvals.Verify(service => service.SubmitDecisionAsync(It.IsAny<Guid>(), It.IsAny<ApprovalDecisionRequest>(), It.IsAny<Guid>(), false, It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ReRequest_Success_ReturnsOk()
    {
        // Arrange
        var gate = SampleGate();
        var approvals = new Mock<IApprovalsService>();
        approvals.Setup(service => service.ReRequestAsync(ApprovalRequestId, 0, UserId, "op-1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ApprovalDecisionResult(ApprovalDecisionOutcome.Success, gate));

        // Act
        var result = await Build(approvals).ReRequest(ApprovalRequestId, new ReRequestApprovalRequest { SlotIndex = 0 }, CancellationToken.None);

        // Assert
        Assert.Same(gate, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task ReRequest_Forbidden_Returns403()
    {
        // Arrange
        var approvals = new Mock<IApprovalsService>();
        approvals.Setup(service => service.ReRequestAsync(ApprovalRequestId, 0, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ApprovalDecisionResult(ApprovalDecisionOutcome.Forbidden));

        // Act
        var result = await Build(approvals).ReRequest(ApprovalRequestId, new ReRequestApprovalRequest { SlotIndex = 0 }, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task GetApprovalRequests_CancellationPropagates()
    {
        // Arrange
        var approvals = new Mock<IApprovalsService>();
        approvals.Setup(service => service.GetForRecordAsync(RecordId, UserId, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() => Build(approvals).GetApprovalRequests(RecordId, cts.Token));
    }
}

public sealed class ApprovalsServiceHelperTests
{
    [Fact]
    public void ParseJson_FrozenApproverSet_DeserialisesSlotsAndMembers()
    {
        // Arrange
        const string json = """
            [{"slotIndex":0,"roleLabel":"GCO","displayLabel":"GCO","eligibleMembers":[{"userId":"00000000-0000-4000-8000-0000000000cc","displayName":"Casey"}]}]
            """;

        // Act
        var slots = ApprovalsService.ParseJson<FrozenApproverSlotDto>(json);

        // Assert
        var slot = Assert.Single(slots);
        Assert.Equal(0, slot.SlotIndex);
        Assert.Equal("GCO", slot.RoleLabel);
        var member = Assert.Single(slot.EligibleMembers);
        Assert.Equal("Casey", member.DisplayName);
    }

    [Fact]
    public void ParseJson_Decisions_DeserialisesRejectionWithComment()
    {
        // Arrange
        const string json = """
            [{"slotIndex":0,"decision":"Rejected","decidedByUserId":"00000000-0000-4000-8000-0000000000cc","decidedByName":"Casey","decidedAt":"2026-07-04T18:00:00","comment":"Add a load test","isProxy":false,"superseded":true}]
            """;

        // Act
        var decisions = ApprovalsService.ParseJson<ApprovalDecisionDto>(json);

        // Assert
        var decision = Assert.Single(decisions);
        Assert.Equal("Rejected", decision.Decision);
        Assert.Equal("Casey", decision.DecidedByName);
        Assert.Equal("Add a load test", decision.Comment);
        Assert.True(decision.Superseded);
    }

    [Fact]
    public void ParseJson_MalformedJson_ReturnsEmpty()
    {
        // Act + Assert
        Assert.Empty(ApprovalsService.ParseJson<ApprovalDecisionDto>("not json"));
    }

    [Fact]
    public void ParseJson_EmptyOrNull_ReturnsEmpty()
    {
        // Act + Assert
        Assert.Empty(ApprovalsService.ParseJson<FrozenApproverSlotDto>(null));
        Assert.Empty(ApprovalsService.ParseJson<FrozenApproverSlotDto>(""));
    }
}
