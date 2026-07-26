using System.Text.Json;
using McDermott.AiTracker.Api.Modules.Ai.Config;
using McDermott.AiTracker.Api.Modules.Ai.Duplicates;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public class DuplicateCheckControllerTests
{
    private const string SubjectId = "LIT-9004";
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid WorkspaceId = Guid.NewGuid();
    private static readonly IReadOnlyList<string> Allowlist = new[] { "Name", "Description", "WorkflowDetails" };

    private readonly Mock<IDuplicateCheckService> _service = new();
    private readonly Mock<IAiConfigService> _config = new();
    private readonly Mock<IRequestsService> _requests = new();
    private readonly Mock<IAccessGuard> _accessGuard = new();
    private readonly Mock<ICurrentUser> _currentUser = new();

    public DuplicateCheckControllerTests()
    {
        _currentUser.SetupGet(user => user.UserId).Returns(UserId);
    }

    private DuplicateCheckController Build() =>
        new(_service.Object, _config.Object, _requests.Object, _accessGuard.Object, _currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };

    private void GrantMember() =>
        _accessGuard
            .Setup(guard => guard.HasWorkspaceLevelAsync(UserId, WorkspaceId, WorkspaceLevel.Viewer, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

    private void ConfigEnabled(bool enabled) =>
        _config.Setup(config => config.GetAsync(WorkspaceId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiConfigDto(enabled, Allowlist));

    private void SubjectVisible() =>
        _requests.Setup(requests => requests.GetByIdAsync(SubjectId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(BuildRecord(SubjectId));

    private static int? StatusOf(IActionResult result) => (result as ObjectResult)?.StatusCode;

    private static ConfirmDuplicateRequest ConfirmBody(string? duplicateOf = "LIT-9010", string? rationale = "Same request.") =>
        new() { DuplicateOfRecordId = duplicateOf, Rationale = rationale };

    private void VerifyCheckNeverCalled() =>
        _service.Verify(service => service.CheckAsync(
            It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);

    private void VerifyConfirmNeverCalled() =>
        _service.Verify(service => service.ConfirmAsync(
            It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);

    // ─── Check ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Check_MemberEnabled_Returns200WithCandidates()
    {
        // Arrange
        GrantMember();
        ConfigEnabled(true);
        SubjectVisible();
        var candidates = new[] { new DuplicateCandidate("LIT-9010", "Acme onboarding", 0.9, "Same request.") };
        _service.Setup(service => service.CheckAsync(WorkspaceId, UserId, SubjectId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(candidates);
        var sut = Build();

        // Act
        var result = await sut.Check(WorkspaceId, SubjectId, CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Same(candidates, ok.Value);
        Assert.Equal("private, no-store", sut.Response.Headers.CacheControl);
    }

    [Fact]
    public async Task Check_NonMember_Returns403()
    {
        // Arrange — no membership granted.
        var sut = Build();

        // Act
        var result = await sut.Check(WorkspaceId, SubjectId, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, StatusOf(result));
        VerifyCheckNeverCalled();
    }

    [Fact]
    public async Task Check_Disabled_Returns403_ServiceNeverCalled()
    {
        // Arrange — member, but AI assist is off.
        GrantMember();
        ConfigEnabled(false);
        var sut = Build();

        // Act
        var result = await sut.Check(WorkspaceId, SubjectId, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, StatusOf(result));
        VerifyCheckNeverCalled();
    }

    [Fact]
    public async Task Check_SubjectNotVisible_Returns403_ServiceNeverCalled()
    {
        // Arrange — member + enabled, but the subject record is not visible to the caller.
        GrantMember();
        ConfigEnabled(true);
        _requests.Setup(requests => requests.GetByIdAsync(SubjectId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((RequestDto?)null);
        var sut = Build();

        // Act
        var result = await sut.Check(WorkspaceId, SubjectId, CancellationToken.None);

        // Assert — an inaccessible record is a 403, never a 404.
        Assert.Equal(StatusCodes.Status403Forbidden, StatusOf(result));
        VerifyCheckNeverCalled();
    }

    // ─── Confirm ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Confirm_Confirmed_Returns204()
    {
        // Arrange
        GrantMember();
        ConfigEnabled(true);
        _service.Setup(service => service.ConfirmAsync(
                WorkspaceId, UserId, SubjectId, "LIT-9010", "Same request.", It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ConfirmDuplicateResult(ConfirmDuplicateOutcome.Confirmed));
        var sut = Build();

        // Act
        var result = await sut.Confirm(WorkspaceId, SubjectId, ConfirmBody(), CancellationToken.None);

        // Assert
        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task Confirm_NonMember_Returns403()
    {
        // Arrange
        var sut = Build();

        // Act
        var result = await sut.Confirm(WorkspaceId, SubjectId, ConfirmBody(), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, StatusOf(result));
        VerifyConfirmNeverCalled();
    }

    [Fact]
    public async Task Confirm_Disabled_Returns403_ServiceNeverCalled()
    {
        // Arrange
        GrantMember();
        ConfigEnabled(false);
        var sut = Build();

        // Act
        var result = await sut.Confirm(WorkspaceId, SubjectId, ConfirmBody(), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, StatusOf(result));
        VerifyConfirmNeverCalled();
    }

    [Fact]
    public async Task Confirm_MissingTarget_Returns400_ServiceNeverCalled()
    {
        // Arrange — enabled + member, but no duplicate target supplied.
        GrantMember();
        ConfigEnabled(true);
        var sut = Build();

        // Act
        var result = await sut.Confirm(WorkspaceId, SubjectId, ConfirmBody(duplicateOf: "  "), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status400BadRequest, StatusOf(result));
        VerifyConfirmNeverCalled();
    }

    [Fact]
    public async Task Confirm_MissingRationale_Returns400_ServiceNeverCalled()
    {
        // Arrange
        GrantMember();
        ConfigEnabled(true);
        var sut = Build();

        // Act
        var result = await sut.Confirm(WorkspaceId, SubjectId, ConfirmBody(rationale: "  "), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status400BadRequest, StatusOf(result));
        VerifyConfirmNeverCalled();
    }

    [Fact]
    public async Task Confirm_SubjectDenied_Returns403()
    {
        // Arrange — the service reports the caller cannot act on the subject.
        GrantMember();
        ConfigEnabled(true);
        _service.Setup(service => service.ConfirmAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ConfirmDuplicateResult(ConfirmDuplicateOutcome.SubjectDenied));
        var sut = Build();

        // Act
        var result = await sut.Confirm(WorkspaceId, SubjectId, ConfirmBody(), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, StatusOf(result));
    }

    [Fact]
    public async Task Confirm_TargetInvalid_Returns400()
    {
        // Arrange — the service reports an invalid duplicate target.
        GrantMember();
        ConfigEnabled(true);
        _service.Setup(service => service.ConfirmAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ConfirmDuplicateResult(ConfirmDuplicateOutcome.TargetInvalid));
        var sut = Build();

        // Act
        var result = await sut.Confirm(WorkspaceId, SubjectId, ConfirmBody(), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status400BadRequest, StatusOf(result));
    }

    private static RequestDto BuildRecord(string id) => new(
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
        Name: "Onboard Acme",
        Description: "Onboard Acme's litigation team",
        Fields: new Dictionary<string, JsonElement>(),
        Bridge: null,
        ETag: "etag");
}
