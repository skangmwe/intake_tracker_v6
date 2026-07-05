// Unit tests for EscalationController (routing / status-code mapping only — the service is mocked).
// Covers 201 Created (+ Location + ConfirmPendingEdits passthrough), 400 pending-edits, 400 missing
// required (ValidationProblemDetails), 409 already-escalated, 400 invalid-target, 403 denied, and
// cancellation propagation (api-testing-guidelines.md).

using McDermott.AiTracker.Api.Modules.Escalation;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class EscalationControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid AiWorkspaceId = Guid.NewGuid();
    private const string RecordId = "LIT-00000001";

    private static EscalationController Build(Mock<IEscalationService> escalation)
    {
        var currentUser = new Mock<McDermott.AiTracker.Api.Shared.Auth.ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        var httpContext = new DefaultHttpContext();
        httpContext.Items[OperationIdMiddleware.HeaderName] = "op-1";

        return new EscalationController(escalation.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
    }

    [Fact]
    public async Task Escalate_Success_Returns201WithLocation()
    {
        // Arrange
        var escalation = new Mock<IEscalationService>();
        var payload = new EscalateResult(RecordId, AiWorkspaceId, AiRecord: null);
        escalation
            .Setup(service => service.EscalateAsync(RecordId, true, UserId, "op-1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new EscalateServiceResult(EscalateOutcome.Success, payload));

        // Act
        var result = await Build(escalation).Escalate(RecordId, new EscalateRequest(true), CancellationToken.None);

        // Assert
        var created = Assert.IsType<CreatedResult>(result);
        Assert.Same(payload, created.Value);
        Assert.Equal($"/api/v1/requests/{RecordId}", created.Location);
    }

    [Fact]
    public async Task Escalate_PassesConfirmPendingEditsThrough()
    {
        // Arrange
        var escalation = new Mock<IEscalationService>();
        escalation
            .Setup(service => service.EscalateAsync(RecordId, false, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new EscalateServiceResult(EscalateOutcome.PendingEdits));

        // Act
        await Build(escalation).Escalate(RecordId, new EscalateRequest(false), CancellationToken.None);

        // Assert — the controller forwards the flag verbatim; it never invents true.
        escalation.Verify(
            service => service.EscalateAsync(RecordId, false, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Theory]
    [InlineData(EscalateOutcome.PendingEdits, StatusCodes.Status400BadRequest)]
    [InlineData(EscalateOutcome.InvalidTarget, StatusCodes.Status400BadRequest)]
    [InlineData(EscalateOutcome.AlreadyEscalated, StatusCodes.Status409Conflict)]
    [InlineData(EscalateOutcome.Denied, StatusCodes.Status403Forbidden)]
    public async Task Escalate_MapsOutcomeToStatus(EscalateOutcome outcome, int expectedStatus)
    {
        // Arrange
        var escalation = new Mock<IEscalationService>();
        escalation
            .Setup(service => service.EscalateAsync(RecordId, It.IsAny<bool>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new EscalateServiceResult(outcome));

        // Act
        var result = await Build(escalation).Escalate(RecordId, new EscalateRequest(true), CancellationToken.None);

        // Assert
        Assert.Equal(expectedStatus, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Escalate_MissingRequired_Returns400ValidationProblem()
    {
        // Arrange
        var errors = new Dictionary<string, string[]> { ["requestor"] = new[] { "Requestor is required before this record can be escalated." } };
        var escalation = new Mock<IEscalationService>();
        escalation
            .Setup(service => service.EscalateAsync(RecordId, It.IsAny<bool>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new EscalateServiceResult(EscalateOutcome.MissingRequired, Errors: errors));

        // Act
        var result = await Build(escalation).Escalate(RecordId, new EscalateRequest(true), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ValidationProblemDetails>(Assert.IsType<ObjectResult>(result).Value);
        Assert.True(problem.Errors.ContainsKey("requestor"));
    }

    [Fact]
    public async Task Escalate_Cancellation_Propagates()
    {
        // Arrange
        var escalation = new Mock<IEscalationService>();
        escalation
            .Setup(service => service.EscalateAsync(RecordId, It.IsAny<bool>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(
            () => Build(escalation).Escalate(RecordId, new EscalateRequest(true), cts.Token));
    }
}
