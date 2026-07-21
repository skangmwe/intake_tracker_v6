// Unit tests for TasksController (routing / status-code mapping only — the service and access guard
// are mocked) plus the pure TasksService helpers. Covers list 200/403, create 201/403/400 (bad kind,
// validation), patch 200/403, bundles 200/403, cancellation propagation, and the type-mapping /
// phase-normalisation / bundle-json helpers (api-testing-guidelines.md).

using McDermott.AiTracker.Api.Modules.Tasks;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class TasksControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private const string RecordId = "AI-00000042";

    private static TasksController Build(
        Mock<ITasksService> tasks, Mock<IAccessGuard>? accessGuard = null)
    {
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        var guard = accessGuard ?? new Mock<IAccessGuard>();

        var httpContext = new DefaultHttpContext();
        httpContext.Items[OperationIdMiddleware.HeaderName] = "op-1";

        return new TasksController(tasks.Object, guard.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
    }

    private static TaskDto SampleTask() =>
        new(Guid.NewGuid(), RecordId, "Confirm scope", "Triage", UserId, "Open", null, null, null, DateTime.UtcNow);

    [Fact]
    public async Task GetTasks_Accessible_ReturnsOk()
    {
        // Arrange
        var list = new List<TaskDto> { SampleTask() };
        var tasks = new Mock<ITasksService>();
        tasks.Setup(service => service.GetTasksAsync(RecordId, UserId, It.IsAny<CancellationToken>())).ReturnsAsync(list);

        // Act
        var result = await Build(tasks).GetTasks(RecordId, CancellationToken.None);

        // Assert
        Assert.Same(list, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task GetTasks_NoAccess_Returns403()
    {
        // Arrange — null distinguishes "cannot see the record" (403) from "empty list" (200).
        var tasks = new Mock<ITasksService>();
        tasks.Setup(service => service.GetTasksAsync(RecordId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((IReadOnlyList<TaskDto>?)null);

        // Act
        var result = await Build(tasks).GetTasks(RecordId, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task CreateTask_Single_Returns201()
    {
        // Arrange
        var created = new List<TaskDto> { SampleTask() };
        var tasks = new Mock<ITasksService>();
        tasks.Setup(service => service.CreateAsync(RecordId, It.IsAny<TaskCreateRequest>(), UserId, "op-1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TaskCreateResult(TaskCreateOutcome.Created, created, null));

        // Act
        var result = await Build(tasks).CreateTask(
            RecordId, new TaskCreateRequest { Kind = "single", Title = "New" }, CancellationToken.None);

        // Assert
        Assert.Same(created, Assert.IsType<CreatedResult>(result).Value);
    }

    [Fact]
    public async Task CreateTask_UnknownKind_Returns400WithoutCallingService()
    {
        // Arrange
        var tasks = new Mock<ITasksService>();

        // Act
        var result = await Build(tasks).CreateTask(
            RecordId, new TaskCreateRequest { Kind = "nonsense" }, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsType<ObjectResult>(result).StatusCode);
        tasks.Verify(
            service => service.CreateAsync(It.IsAny<string>(), It.IsAny<TaskCreateRequest>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task CreateTask_Forbidden_Returns403()
    {
        // Arrange
        var tasks = new Mock<ITasksService>();
        tasks.Setup(service => service.CreateAsync(RecordId, It.IsAny<TaskCreateRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TaskCreateResult(TaskCreateOutcome.Forbidden, Array.Empty<TaskDto>(), null));

        // Act
        var result = await Build(tasks).CreateTask(
            RecordId, new TaskCreateRequest { Kind = "single", Title = "New" }, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task CreateTask_Invalid_Returns400()
    {
        // Arrange — a bad bundle id resolves to Invalid with field errors.
        var errors = new Dictionary<string, string[]> { ["bundleTemplateId"] = new[] { "That task bundle could not be found." } };
        var tasks = new Mock<ITasksService>();
        tasks.Setup(service => service.CreateAsync(RecordId, It.IsAny<TaskCreateRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TaskCreateResult(TaskCreateOutcome.Invalid, Array.Empty<TaskDto>(), errors));

        // Act
        var result = await Build(tasks).CreateTask(
            RecordId, new TaskCreateRequest { Kind = "bundle", BundleTemplateId = Guid.NewGuid() }, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
        Assert.IsType<ValidationProblemDetails>(problem.Value);
    }

    [Fact]
    public async Task PatchTask_Success_ReturnsOk()
    {
        // Arrange
        var task = SampleTask();
        var taskId = Guid.NewGuid();
        var tasks = new Mock<ITasksService>();
        tasks.Setup(service => service.PatchAsync(taskId, It.IsAny<TaskPatchRequest>(), UserId, "op-1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TaskPatchResult(TaskPatchOutcome.Success, task));

        // Act
        var result = await Build(tasks).PatchTask(taskId, new TaskPatchRequest { Status = "Done" }, CancellationToken.None);

        // Assert
        Assert.Same(task, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task PatchTask_NoAccess_Returns403()
    {
        // Arrange
        var taskId = Guid.NewGuid();
        var tasks = new Mock<ITasksService>();
        tasks.Setup(service => service.PatchAsync(taskId, It.IsAny<TaskPatchRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TaskPatchResult(TaskPatchOutcome.Denied));

        // Act
        var result = await Build(tasks).PatchTask(taskId, new TaskPatchRequest { Status = "Done" }, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task PatchTask_RecordOnHold_Returns409()
    {
        // Slice 26 — parent record is OnHold / Abandoned; task Status→Done is blocked.
        // Arrange
        var taskId = Guid.NewGuid();
        var tasks = new Mock<ITasksService>();
        tasks.Setup(service => service.PatchAsync(taskId, It.IsAny<TaskPatchRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TaskPatchResult(TaskPatchOutcome.RecordOnHold));

        // Act
        var result = await Build(tasks).PatchTask(taskId, new TaskPatchRequest { Status = "Done" }, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status409Conflict, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task GetBundles_Member_ReturnsOk()
    {
        // Arrange
        var workspaceId = Guid.NewGuid();
        var bundles = new List<TaskBundleTemplateDto>
        {
            new(Guid.NewGuid(), "Drafting assistant", Array.Empty<TaskBundleTemplateTaskDto>()),
        };
        var guard = new Mock<IAccessGuard>();
        guard.Setup(check => check.HasWorkspaceLevelAsync(UserId, workspaceId, WorkspaceLevel.Viewer, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        var tasks = new Mock<ITasksService>();
        tasks.Setup(service => service.GetBundlesAsync(workspaceId, It.IsAny<CancellationToken>())).ReturnsAsync(bundles);

        // Act
        var result = await Build(tasks, guard).GetBundles(workspaceId, CancellationToken.None);

        // Assert
        Assert.Same(bundles, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task GetBundles_NonMember_Returns403WithoutReadingBundles()
    {
        // Arrange
        var workspaceId = Guid.NewGuid();
        var guard = new Mock<IAccessGuard>();
        guard.Setup(check => check.HasWorkspaceLevelAsync(UserId, workspaceId, WorkspaceLevel.Viewer, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);
        var tasks = new Mock<ITasksService>();

        // Act
        var result = await Build(tasks, guard).GetBundles(workspaceId, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
        tasks.Verify(service => service.GetBundlesAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task GetTasks_CancellationPropagates()
    {
        // Arrange
        var tasks = new Mock<ITasksService>();
        tasks.Setup(service => service.GetTasksAsync(RecordId, UserId, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() => Build(tasks).GetTasks(RecordId, cts.Token));
    }
}

public sealed class TasksServiceHelperTests
{
    [Theory]
    [InlineData("Url", "url")]
    [InlineData("Text", "text")]
    [InlineData("Number", "number")]
    [InlineData("Date", "date")]
    [InlineData("SingleSelect", "select")]
    [InlineData("Boolean", "checkbox")]
    public void MapDefinitionTypeToKind_KnownTypes_MapToWireKind(string fieldType, string expected)
    {
        // Act
        var kind = TasksService.MapDefinitionTypeToKind(fieldType);

        // Assert
        Assert.Equal(expected, kind);
    }

    [Fact]
    public void MapDefinitionTypeToKind_UnknownType_ReturnsNull()
    {
        // Act + Assert
        Assert.Null(TasksService.MapDefinitionTypeToKind("Mystery"));
    }

    [Theory]
    [InlineData("Execution", "Execution")]
    [InlineData("Triage", "Triage")]
    [InlineData("", "Unphased")]
    [InlineData(null, "Unphased")]
    [InlineData("Nonsense", "Unphased")]
    public void NormalisePhase_UnknownFallsToUnphased(string? input, string expected)
    {
        // Act + Assert
        Assert.Equal(expected, TasksService.NormalisePhase(input));
    }

    [Fact]
    public void ParseBundleTasks_ValidJson_ReturnsEntriesWithNormalisedPhases()
    {
        // Arrange
        const string json = "[{\"title\":\"Alpha\",\"phase\":\"Execution\"},{\"title\":\"Beta\",\"phase\":\"\"}]";

        // Act
        var tasks = TasksService.ParseBundleTasks(json);

        // Assert
        Assert.Equal(2, tasks.Count);
        Assert.Equal("Alpha", tasks[0].Title);
        Assert.Equal("Execution", tasks[0].Phase);
        Assert.Equal("Unphased", tasks[1].Phase);
    }

    [Fact]
    public void ParseBundleTasks_MalformedJson_ReturnsEmpty()
    {
        // Act + Assert
        Assert.Empty(TasksService.ParseBundleTasks("not json"));
    }
}
