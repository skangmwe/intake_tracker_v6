// Unit tests for CustomRecordsController (Slice 1b) — routing, access mapping, and status-code
// mapping only. The service and access guard are mocked. Covers access-denied (403) per verb, each
// service outcome (Success / ValidationFailed / NotFound) mapped to its status, and the pageSize
// ceiling (400).

using System.Collections.Generic;
using System.Text.Json;
using McDermott.AiTracker.Api.Modules.CustomRecords;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class CustomRecordsControllerTests
{
    private static readonly Guid WorkspaceId = new("A1000000-0000-4000-8000-000000000001");
    private static readonly Guid UserId = new("A1000000-0000-4000-8000-000000000002");
    private static readonly Guid ObjectId = new("A1000000-0000-4000-8000-000000000003");
    private static readonly Guid RecordId = new("A1000000-0000-4000-8000-000000000004");

    private static readonly IReadOnlyDictionary<string, JsonElement> NoFields =
        new Dictionary<string, JsonElement>();

    private static CustomRecordsController Build(
        Mock<ICustomRecordsService> service, bool isViewer = true, bool isMember = true)
    {
        var accessGuard = new Mock<IAccessGuard>();
        accessGuard.Setup(guard => guard.HasWorkspaceLevelAsync(
            UserId, WorkspaceId, WorkspaceLevel.Viewer, It.IsAny<CancellationToken>())).ReturnsAsync(isViewer);
        accessGuard.Setup(guard => guard.HasWorkspaceLevelAsync(
            UserId, WorkspaceId, WorkspaceLevel.Member, It.IsAny<CancellationToken>())).ReturnsAsync(isMember);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        return new CustomRecordsController(service.Object, accessGuard.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    private static CustomRecordDto SampleDto() =>
        new(RecordId, ObjectId, "Acme", NoFields, DateTime.UtcNow, DateTime.UtcNow, "creator-oid", "AAAAAAAAAAA=");

    private static CustomRecordWriteRequest SampleBody() => new("Acme", null);

    private static int Status(IActionResult result) => result switch
    {
        ObjectResult obj => obj.StatusCode ?? 0,
        StatusCodeResult code => code.StatusCode,
        _ => 0,
    };

    // ─── Create ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Create_Member_Success_Returns201()
    {
        var service = new Mock<ICustomRecordsService>();
        service.Setup(svc => svc.CreateAsync(WorkspaceId, ObjectId, It.IsAny<CustomRecordWriteRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CustomRecordWriteResult(CustomRecordWriteOutcome.Success, SampleDto()));

        var result = await Build(service).Create(WorkspaceId, ObjectId, SampleBody(), CancellationToken.None);

        Assert.Equal(StatusCodes.Status201Created, Status(result));
    }

    [Fact]
    public async Task Create_NonMember_Returns403()
    {
        var service = new Mock<ICustomRecordsService>();
        var result = await Build(service, isMember: false).Create(WorkspaceId, ObjectId, SampleBody(), CancellationToken.None);
        Assert.Equal(StatusCodes.Status403Forbidden, Status(result));
    }

    [Fact]
    public async Task Create_ValidationFailed_Returns400()
    {
        var service = new Mock<ICustomRecordsService>();
        service.Setup(svc => svc.CreateAsync(WorkspaceId, ObjectId, It.IsAny<CustomRecordWriteRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CustomRecordWriteResult(
                CustomRecordWriteOutcome.ValidationFailed,
                Errors: new Dictionary<string, string[]> { ["name"] = new[] { "required" } }));

        var result = await Build(service).Create(WorkspaceId, ObjectId, SampleBody(), CancellationToken.None);

        Assert.Equal(StatusCodes.Status400BadRequest, Status(result));
    }

    [Fact]
    public async Task Create_NotFound_Returns404()
    {
        var service = new Mock<ICustomRecordsService>();
        service.Setup(svc => svc.CreateAsync(WorkspaceId, ObjectId, It.IsAny<CustomRecordWriteRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CustomRecordWriteResult(CustomRecordWriteOutcome.NotFound));

        var result = await Build(service).Create(WorkspaceId, ObjectId, SampleBody(), CancellationToken.None);

        Assert.Equal(StatusCodes.Status404NotFound, Status(result));
    }

    // ─── Query ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Query_Viewer_Returns200()
    {
        var service = new Mock<ICustomRecordsService>();
        service.Setup(svc => svc.QueryAsync(WorkspaceId, ObjectId, It.IsAny<PaginatedQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PaginatedResponse<CustomRecordListRow>(Array.Empty<CustomRecordListRow>(), 0, 1, 20));

        var result = await Build(service).Query(WorkspaceId, ObjectId, new PaginatedQuery(), CancellationToken.None);

        Assert.Equal(StatusCodes.Status200OK, Status(result));
    }

    [Fact]
    public async Task Query_NonViewer_Returns403()
    {
        var service = new Mock<ICustomRecordsService>();
        var result = await Build(service, isViewer: false).Query(WorkspaceId, ObjectId, new PaginatedQuery(), CancellationToken.None);
        Assert.Equal(StatusCodes.Status403Forbidden, Status(result));
    }

    [Fact]
    public async Task Query_ObjectNotFound_Returns404()
    {
        var service = new Mock<ICustomRecordsService>();
        service.Setup(svc => svc.QueryAsync(WorkspaceId, ObjectId, It.IsAny<PaginatedQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((PaginatedResponse<CustomRecordListRow>?)null);

        var result = await Build(service).Query(WorkspaceId, ObjectId, new PaginatedQuery(), CancellationToken.None);

        Assert.Equal(StatusCodes.Status404NotFound, Status(result));
    }

    [Fact]
    public async Task Query_PageSizeTooLarge_Returns400()
    {
        var service = new Mock<ICustomRecordsService>();
        var result = await Build(service).Query(WorkspaceId, ObjectId, new PaginatedQuery { PageSize = 101 }, CancellationToken.None);
        Assert.Equal(StatusCodes.Status400BadRequest, Status(result));
    }

    // ─── Get ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Get_Viewer_Returns200()
    {
        var service = new Mock<ICustomRecordsService>();
        service.Setup(svc => svc.GetByIdAsync(WorkspaceId, ObjectId, RecordId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(SampleDto());

        var result = await Build(service).Get(WorkspaceId, ObjectId, RecordId, CancellationToken.None);

        Assert.Equal(StatusCodes.Status200OK, Status(result));
    }

    [Fact]
    public async Task Get_NotFound_Returns404()
    {
        var service = new Mock<ICustomRecordsService>();
        service.Setup(svc => svc.GetByIdAsync(WorkspaceId, ObjectId, RecordId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((CustomRecordDto?)null);

        var result = await Build(service).Get(WorkspaceId, ObjectId, RecordId, CancellationToken.None);

        Assert.Equal(StatusCodes.Status404NotFound, Status(result));
    }

    [Fact]
    public async Task Get_NonViewer_Returns403()
    {
        var service = new Mock<ICustomRecordsService>();
        var result = await Build(service, isViewer: false).Get(WorkspaceId, ObjectId, RecordId, CancellationToken.None);
        Assert.Equal(StatusCodes.Status403Forbidden, Status(result));
    }

    // ─── Patch ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Patch_Member_Success_Returns200()
    {
        var service = new Mock<ICustomRecordsService>();
        service.Setup(svc => svc.PatchAsync(WorkspaceId, ObjectId, RecordId, It.IsAny<CustomRecordWriteRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CustomRecordWriteResult(CustomRecordWriteOutcome.Success, SampleDto()));

        var result = await Build(service).Update(WorkspaceId, ObjectId, RecordId, SampleBody(), CancellationToken.None);

        Assert.Equal(StatusCodes.Status200OK, Status(result));
    }

    [Fact]
    public async Task Patch_ValidationFailed_Returns400()
    {
        var service = new Mock<ICustomRecordsService>();
        service.Setup(svc => svc.PatchAsync(WorkspaceId, ObjectId, RecordId, It.IsAny<CustomRecordWriteRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CustomRecordWriteResult(
                CustomRecordWriteOutcome.ValidationFailed,
                Errors: new Dictionary<string, string[]> { ["name"] = new[] { "required" } }));

        var result = await Build(service).Update(WorkspaceId, ObjectId, RecordId, SampleBody(), CancellationToken.None);

        Assert.Equal(StatusCodes.Status400BadRequest, Status(result));
    }

    [Fact]
    public async Task Patch_NotFound_Returns404()
    {
        var service = new Mock<ICustomRecordsService>();
        service.Setup(svc => svc.PatchAsync(WorkspaceId, ObjectId, RecordId, It.IsAny<CustomRecordWriteRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CustomRecordWriteResult(CustomRecordWriteOutcome.NotFound));

        var result = await Build(service).Update(WorkspaceId, ObjectId, RecordId, SampleBody(), CancellationToken.None);

        Assert.Equal(StatusCodes.Status404NotFound, Status(result));
    }

    [Fact]
    public async Task Patch_NonMember_Returns403()
    {
        var service = new Mock<ICustomRecordsService>();
        var result = await Build(service, isMember: false).Update(WorkspaceId, ObjectId, RecordId, SampleBody(), CancellationToken.None);
        Assert.Equal(StatusCodes.Status403Forbidden, Status(result));
    }

    // ─── Delete ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Delete_Member_Success_Returns204()
    {
        var service = new Mock<ICustomRecordsService>();
        service.Setup(svc => svc.DeleteAsync(WorkspaceId, ObjectId, RecordId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(CustomRecordWriteOutcome.Success);

        var result = await Build(service).Delete(WorkspaceId, ObjectId, RecordId, CancellationToken.None);

        Assert.Equal(StatusCodes.Status204NoContent, Status(result));
    }

    [Fact]
    public async Task Delete_NotFound_Returns404()
    {
        var service = new Mock<ICustomRecordsService>();
        service.Setup(svc => svc.DeleteAsync(WorkspaceId, ObjectId, RecordId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(CustomRecordWriteOutcome.NotFound);

        var result = await Build(service).Delete(WorkspaceId, ObjectId, RecordId, CancellationToken.None);

        Assert.Equal(StatusCodes.Status404NotFound, Status(result));
    }

    [Fact]
    public async Task Delete_NonMember_Returns403()
    {
        var service = new Mock<ICustomRecordsService>();
        var result = await Build(service, isMember: false).Delete(WorkspaceId, ObjectId, RecordId, CancellationToken.None);
        Assert.Equal(StatusCodes.Status403Forbidden, Status(result));
    }
}
