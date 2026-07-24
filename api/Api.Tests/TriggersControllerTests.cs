// Unit tests for TriggersController (slice: triggers-request-authoring) — routing, access mapping, and
// status-code mapping only. The service and access guard are mocked. Covers access-denied (403) per verb,
// each service outcome (Success / ValidationFailed / NotFound) mapped to its status, and 204/404 on delete.

using McDermott.AiTracker.Api.Modules.Triggers;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class TriggersControllerTests
{
    private static readonly Guid WorkspaceId = new("A1000000-0000-4000-8000-000000000001");
    private static readonly Guid UserId = new("A1000000-0000-4000-8000-000000000002");
    private static readonly Guid TriggerId = new("A1000000-0000-4000-8000-000000000003");

    private static TriggersController Build(Mock<ITriggersService> service, bool isAdmin = true)
    {
        var accessGuard = new Mock<IAccessGuard>();
        accessGuard.Setup(guard => guard.HasWorkspaceLevelAsync(
            UserId, WorkspaceId, WorkspaceLevel.WorkspaceAdmin, It.IsAny<CancellationToken>())).ReturnsAsync(isAdmin);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        return new TriggersController(service.Object, accessGuard.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    private static TriggerDto SampleDto() => new(
        TriggerId, "Request", "Authored", "Overdue", false, "Once", null, null, "sla-reminder",
        new[] { "assignedAnalyst" }, "A request is overdue", string.Empty,
        new[] { new TriggerConditionDto("dueDate", "lt", "@today") });

    private static TriggerUpsertRequest SampleBody() => new(
        "Overdue", false, "Once", null, "sla-reminder", new[] { "assignedAnalyst" }, "A request is overdue",
        string.Empty, new[] { new TriggerConditionDto("dueDate", "lt", "@today") });

    private static int Status(IActionResult result) => result switch
    {
        ObjectResult obj => obj.StatusCode ?? 0,
        StatusCodeResult code => code.StatusCode,
        _ => 0,
    };

    [Fact]
    public async Task GetTriggers_NotAdmin_Returns403()
    {
        var sut = Build(new Mock<ITriggersService>(), isAdmin: false);
        var result = await sut.GetTriggers(WorkspaceId, CancellationToken.None);
        Assert.Equal(StatusCodes.Status403Forbidden, Status(result));
    }

    [Fact]
    public async Task CreateTrigger_NotAdmin_Returns403()
    {
        var sut = Build(new Mock<ITriggersService>(), isAdmin: false);
        var result = await sut.CreateTrigger(WorkspaceId, SampleBody(), CancellationToken.None);
        Assert.Equal(StatusCodes.Status403Forbidden, Status(result));
    }

    [Fact]
    public async Task DeleteTrigger_NotAdmin_Returns403()
    {
        var sut = Build(new Mock<ITriggersService>(), isAdmin: false);
        var result = await sut.DeleteTrigger(WorkspaceId, TriggerId, CancellationToken.None);
        Assert.Equal(StatusCodes.Status403Forbidden, Status(result));
    }

    [Fact]
    public async Task CreateTrigger_Success_Returns201()
    {
        var service = new Mock<ITriggersService>();
        service.Setup(s => s.UpsertAsync(WorkspaceId, null, It.IsAny<TriggerUpsertRequest>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TriggerUpsertResult(TriggerUpsertOutcome.Success, SampleDto()));
        var sut = Build(service);

        var result = await sut.CreateTrigger(WorkspaceId, SampleBody(), CancellationToken.None);

        Assert.Equal(StatusCodes.Status201Created, Status(result));
    }

    [Fact]
    public async Task CreateTrigger_ValidationFailed_Returns400()
    {
        var service = new Mock<ITriggersService>();
        service.Setup(s => s.UpsertAsync(WorkspaceId, null, It.IsAny<TriggerUpsertRequest>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TriggerUpsertResult(TriggerUpsertOutcome.ValidationFailed, Errors: new[] { "Add at least one condition." }));
        var sut = Build(service);

        var result = await sut.CreateTrigger(WorkspaceId, SampleBody(), CancellationToken.None);

        Assert.Equal(StatusCodes.Status400BadRequest, Status(result));
    }

    [Fact]
    public async Task UpdateTrigger_NotFound_Returns404()
    {
        var service = new Mock<ITriggersService>();
        service.Setup(s => s.UpsertAsync(WorkspaceId, TriggerId, It.IsAny<TriggerUpsertRequest>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TriggerUpsertResult(TriggerUpsertOutcome.NotFound));
        var sut = Build(service);

        var result = await sut.UpdateTrigger(WorkspaceId, TriggerId, SampleBody(), CancellationToken.None);

        Assert.Equal(StatusCodes.Status404NotFound, Status(result));
    }

    [Fact]
    public async Task UpdateTrigger_Success_Returns200()
    {
        var service = new Mock<ITriggersService>();
        service.Setup(s => s.UpsertAsync(WorkspaceId, TriggerId, It.IsAny<TriggerUpsertRequest>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TriggerUpsertResult(TriggerUpsertOutcome.Success, SampleDto()));
        var sut = Build(service);

        var result = await sut.UpdateTrigger(WorkspaceId, TriggerId, SampleBody(), CancellationToken.None);

        Assert.Equal(StatusCodes.Status200OK, Status(result));
    }

    [Fact]
    public async Task GetTrigger_NotFound_Returns404()
    {
        var service = new Mock<ITriggersService>();
        service.Setup(s => s.GetByIdAsync(WorkspaceId, TriggerId, It.IsAny<CancellationToken>())).ReturnsAsync((TriggerDto?)null);
        var sut = Build(service);

        var result = await sut.GetTrigger(WorkspaceId, TriggerId, CancellationToken.None);

        Assert.Equal(StatusCodes.Status404NotFound, Status(result));
    }

    [Fact]
    public async Task DeleteTrigger_Deleted_Returns204()
    {
        var service = new Mock<ITriggersService>();
        service.Setup(s => s.DeleteAsync(WorkspaceId, TriggerId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(TriggerDeleteOutcome.Deleted);
        var sut = Build(service);

        var result = await sut.DeleteTrigger(WorkspaceId, TriggerId, CancellationToken.None);

        Assert.Equal(StatusCodes.Status204NoContent, Status(result));
    }

    [Fact]
    public async Task DeleteTrigger_NotFound_Returns404()
    {
        var service = new Mock<ITriggersService>();
        service.Setup(s => s.DeleteAsync(WorkspaceId, TriggerId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(TriggerDeleteOutcome.NotFound);
        var sut = Build(service);

        var result = await sut.DeleteTrigger(WorkspaceId, TriggerId, CancellationToken.None);

        Assert.Equal(StatusCodes.Status404NotFound, Status(result));
    }
}
