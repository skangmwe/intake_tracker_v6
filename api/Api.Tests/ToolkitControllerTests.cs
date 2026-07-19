// Unit tests for ToolkitController (routing / boundary validation / status-code mapping only — the
// service is mocked). Covers query (403 / 200), get (403 / 200), create validation (missing payload
// 400, invalid JSON 400, missing name 400, bad kind 400, bad status 400, disallowed extension 400,
// oversize 413) + outcome mapping (201 / 403 / 409 / 502 / 500) + filename sanitize, patch validation
// + mapping (200 / 403 / 409), retire/restore (204 / 403), download (file / 403 / 404), and
// cancellation propagation (api-testing-guidelines.md). Access denials are 403, never 404 (BS §22.6).

using System.Text.Json;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Modules.Toolkit;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class ToolkitControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid WorkspaceId = Guid.NewGuid();
    private const string ItemId = "AIS-00000073";

    private static ToolkitController Build(Mock<IToolkitService> service, ToolkitOptions? options = null)
    {
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        var httpContext = new DefaultHttpContext();
        httpContext.Items[OperationIdMiddleware.HeaderName] = "op-123";

        return new ToolkitController(service.Object, currentUser.Object, Options.Create(options ?? new ToolkitOptions()))
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
    }

    private static IFormFile FakeFile(string name, string contentType, long length)
    {
        var file = new Mock<IFormFile>();
        file.SetupGet(entry => entry.FileName).Returns(name);
        file.SetupGet(entry => entry.ContentType).Returns(contentType);
        file.SetupGet(entry => entry.Length).Returns(length);
        file.Setup(entry => entry.OpenReadStream()).Returns(() => new MemoryStream(new byte[] { 1, 2, 3 }));
        return file.Object;
    }

    private static ToolkitItemDto SampleDto() => new(
        ItemId, WorkspaceId, "Prompt", "Draft", "Clause extraction prompt", "one-liner", "desc", "Mia Chen",
        "how to use", "body", null, DateTime.UtcNow, "u", DateTime.UtcNow, "u", false, "etag==");

    private static string Payload(object body) => JsonSerializer.Serialize(body, new JsonSerializerOptions(JsonSerializerDefaults.Web));

    // ─── Query + Get ────────────────────────────────────────────────────────────

    [Fact]
    public async Task Query_Denied_Returns403()
    {
        // Arrange
        var service = new Mock<IToolkitService>();
        service.Setup(s => s.QueryAsync(WorkspaceId, UserId, It.IsAny<PaginatedQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((PaginatedResponse<ToolkitItemListRowDto>?)null);

        // Act
        var result = await Build(service).QueryToolkit(WorkspaceId, new PaginatedQuery { Page = 1, PageSize = 20 }, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Query_Accessible_ReturnsOk()
    {
        // Arrange
        var page = new PaginatedResponse<ToolkitItemListRowDto>(Array.Empty<ToolkitItemListRowDto>(), 0, 1, 20);
        var service = new Mock<IToolkitService>();
        service.Setup(s => s.QueryAsync(WorkspaceId, UserId, It.IsAny<PaginatedQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(page);

        // Act
        var result = await Build(service).QueryToolkit(WorkspaceId, new PaginatedQuery { Page = 1, PageSize = 20 }, CancellationToken.None);

        // Assert
        Assert.Same(page, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task Get_NotVisible_Returns403()
    {
        // Arrange
        var service = new Mock<IToolkitService>();
        service.Setup(s => s.GetByIdAsync(ItemId, UserId, It.IsAny<CancellationToken>())).ReturnsAsync((ToolkitItemDto?)null);

        // Act
        var result = await Build(service).GetItem(ItemId, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Get_Visible_ReturnsOk()
    {
        // Arrange
        var dto = SampleDto();
        var service = new Mock<IToolkitService>();
        service.Setup(s => s.GetByIdAsync(ItemId, UserId, It.IsAny<CancellationToken>())).ReturnsAsync(dto);

        // Act
        var result = await Build(service).GetItem(ItemId, CancellationToken.None);

        // Assert
        Assert.Same(dto, Assert.IsType<OkObjectResult>(result).Value);
    }

    // ─── Create validation ──────────────────────────────────────────────────────

    [Fact]
    public async Task Create_MissingPayload_Returns400()
    {
        // Arrange
        var service = new Mock<IToolkitService>();

        // Act
        var result = await Build(service).CreateItem(WorkspaceId, null, null, CancellationToken.None);

        // Assert — validated at the boundary; the service is never called.
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsType<ObjectResult>(result).StatusCode);
        service.Verify(s => s.CreateAsync(It.IsAny<Guid>(), It.IsAny<ToolkitItemCreateRequest>(), It.IsAny<ToolkitUpload?>(),
            It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Create_InvalidJson_Returns400()
    {
        var result = await Build(new Mock<IToolkitService>()).CreateItem(WorkspaceId, "{not json", null, CancellationToken.None);
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Create_MissingName_Returns400()
    {
        var payload = Payload(new { kind = "Prompt" });
        var result = await Build(new Mock<IToolkitService>()).CreateItem(WorkspaceId, payload, null, CancellationToken.None);
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Create_BadKind_Returns400()
    {
        var payload = Payload(new { kind = "Widget", name = "X" });
        var result = await Build(new Mock<IToolkitService>()).CreateItem(WorkspaceId, payload, null, CancellationToken.None);
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Create_BadStatus_Returns400()
    {
        var payload = Payload(new { kind = "Prompt", name = "X", status = "Live" });
        var result = await Build(new Mock<IToolkitService>()).CreateItem(WorkspaceId, payload, null, CancellationToken.None);
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Create_DisallowedExtension_Returns400()
    {
        var payload = Payload(new { kind = "Prompt", name = "X" });
        var result = await Build(new Mock<IToolkitService>())
            .CreateItem(WorkspaceId, payload, FakeFile("evil.exe", "application/x-msdownload", 10), CancellationToken.None);
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Create_Oversize_Returns413()
    {
        // Arrange — a 2-byte cap makes any real file too large.
        var payload = Payload(new { kind = "Prompt", name = "X" });
        var options = new ToolkitOptions { MaxFileBytes = 2 };

        // Act
        var result = await Build(new Mock<IToolkitService>(), options)
            .CreateItem(WorkspaceId, payload, FakeFile("big.md", "text/markdown", 5), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status413RequestEntityTooLarge, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Theory]
    [InlineData(ToolkitWriteOutcome.Denied, StatusCodes.Status403Forbidden)]
    [InlineData(ToolkitWriteOutcome.BlobFailed, StatusCodes.Status502BadGateway)]
    [InlineData(ToolkitWriteOutcome.PersistFailed, StatusCodes.Status500InternalServerError)]
    public async Task Create_FailureOutcomes_MapToStatus(ToolkitWriteOutcome outcome, int expected)
    {
        // Arrange
        var service = new Mock<IToolkitService>();
        service.Setup(s => s.CreateAsync(WorkspaceId, It.IsAny<ToolkitItemCreateRequest>(), It.IsAny<ToolkitUpload?>(), UserId, "op-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ToolkitWriteResult(outcome));
        var payload = Payload(new { kind = "Prompt", name = "X" });

        // Act
        var result = await Build(service).CreateItem(WorkspaceId, payload, null, CancellationToken.None);

        // Assert
        Assert.Equal(expected, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Create_Success_Returns201()
    {
        // Arrange
        var dto = SampleDto();
        var service = new Mock<IToolkitService>();
        service.Setup(s => s.CreateAsync(WorkspaceId, It.IsAny<ToolkitItemCreateRequest>(), It.IsAny<ToolkitUpload?>(), UserId, "op-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ToolkitWriteResult(ToolkitWriteOutcome.Success, dto));
        var payload = Payload(new { kind = "Prompt", name = "X" });

        // Act
        var result = await Build(service).CreateItem(WorkspaceId, payload, null, CancellationToken.None);

        // Assert
        Assert.Same(dto, Assert.IsType<CreatedResult>(result).Value);
    }

    [Fact]
    public async Task Create_WithFile_StripsDirectoryFromFilename()
    {
        // Arrange — a traversal-shaped name is reduced to its leaf before the service sees it.
        ToolkitUpload? captured = null;
        var service = new Mock<IToolkitService>();
        service.Setup(s => s.CreateAsync(WorkspaceId, It.IsAny<ToolkitItemCreateRequest>(), It.IsAny<ToolkitUpload?>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Callback<Guid, ToolkitItemCreateRequest, ToolkitUpload?, Guid, string, CancellationToken>((_, _, upload, _, _, _) => captured = upload)
            .ReturnsAsync(new ToolkitWriteResult(ToolkitWriteOutcome.Success, SampleDto()));
        var payload = Payload(new { kind = "Prompt", name = "X" });

        // Act
        await Build(service).CreateItem(WorkspaceId, payload, FakeFile("../../evil.md", "text/markdown", 10), CancellationToken.None);

        // Assert — the service saw the sanitized leaf, never the traversal path.
        Assert.NotNull(captured);
        Assert.Equal("evil.md", captured!.FileName);
    }

    // ─── Patch ──────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Patch_BadStatus_Returns400()
    {
        var payload = Payload(new { status = "Live" });
        var result = await Build(new Mock<IToolkitService>()).UpdateItem(ItemId, payload, null, CancellationToken.None);
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Patch_Stale_Returns409()
    {
        // Arrange
        var service = new Mock<IToolkitService>();
        service.Setup(s => s.PatchAsync(ItemId, It.IsAny<ToolkitItemPatchRequest>(), It.IsAny<ToolkitUpload?>(), It.IsAny<string?>(), UserId, "op-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ToolkitWriteResult(ToolkitWriteOutcome.Stale));
        var payload = Payload(new { name = "Y", ifMatch = "abc" });

        // Act
        var result = await Build(service).UpdateItem(ItemId, payload, null, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status409Conflict, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Patch_Denied_Returns403()
    {
        // Arrange
        var service = new Mock<IToolkitService>();
        service.Setup(s => s.PatchAsync(ItemId, It.IsAny<ToolkitItemPatchRequest>(), It.IsAny<ToolkitUpload?>(), It.IsAny<string?>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ToolkitWriteResult(ToolkitWriteOutcome.Denied));
        var payload = Payload(new { name = "Y" });

        // Act
        var result = await Build(service).UpdateItem(ItemId, payload, null, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Patch_Success_ReturnsOk()
    {
        // Arrange
        var dto = SampleDto();
        var service = new Mock<IToolkitService>();
        service.Setup(s => s.PatchAsync(ItemId, It.IsAny<ToolkitItemPatchRequest>(), It.IsAny<ToolkitUpload?>(), It.IsAny<string?>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ToolkitWriteResult(ToolkitWriteOutcome.Success, dto));
        var payload = Payload(new { name = "Y" });

        // Act
        var result = await Build(service).UpdateItem(ItemId, payload, null, CancellationToken.None);

        // Assert
        Assert.Same(dto, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task Patch_IfMatchHeader_TakesPrecedenceOverBody()
    {
        // Arrange — the header ETag wins over the body's ifMatch (mirrors Features).
        string? capturedIfMatch = null;
        var service = new Mock<IToolkitService>();
        service.Setup(s => s.PatchAsync(ItemId, It.IsAny<ToolkitItemPatchRequest>(), It.IsAny<ToolkitUpload?>(), It.IsAny<string?>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Callback<string, ToolkitItemPatchRequest, ToolkitUpload?, string?, Guid, string, CancellationToken>((_, _, _, ifMatch, _, _, _) => capturedIfMatch = ifMatch)
            .ReturnsAsync(new ToolkitWriteResult(ToolkitWriteOutcome.Success, SampleDto()));
        var controller = Build(service);
        controller.ControllerContext.HttpContext.Request.Headers.IfMatch = "\"header-etag\"";
        var payload = Payload(new { name = "Y", ifMatch = "body-etag" });

        // Act
        await controller.UpdateItem(ItemId, payload, null, CancellationToken.None);

        // Assert
        Assert.Equal("header-etag", capturedIfMatch);
    }

    // ─── Retire / Restore ───────────────────────────────────────────────────────

    [Fact]
    public async Task Retire_Success_Returns204()
    {
        var service = new Mock<IToolkitService>();
        service.Setup(s => s.RetireAsync(ItemId, UserId, "op-123", It.IsAny<CancellationToken>())).ReturnsAsync(true);
        var result = await Build(service).RetireItem(ItemId, CancellationToken.None);
        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task Retire_Denied_Returns403()
    {
        var service = new Mock<IToolkitService>();
        service.Setup(s => s.RetireAsync(ItemId, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(false);
        var result = await Build(service).RetireItem(ItemId, CancellationToken.None);
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Restore_Success_Returns204()
    {
        var service = new Mock<IToolkitService>();
        service.Setup(s => s.RestoreAsync(ItemId, UserId, "op-123", It.IsAny<CancellationToken>())).ReturnsAsync(true);
        var result = await Build(service).RestoreItem(ItemId, CancellationToken.None);
        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task Restore_Denied_Returns403()
    {
        var service = new Mock<IToolkitService>();
        service.Setup(s => s.RestoreAsync(ItemId, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(false);
        var result = await Build(service).RestoreItem(ItemId, CancellationToken.None);
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    // ─── Download ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Download_Success_ReturnsFileStream()
    {
        // Arrange
        var download = new ToolkitDownload("the/path", "playbook.pdf", "application/pdf");
        var service = new Mock<IToolkitService>();
        service.Setup(s => s.GetForDownloadAsync(ItemId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ToolkitDownloadResult(ToolkitDownloadOutcome.Success, download));
        service.Setup(s => s.GetContentStreamAsync(download, It.IsAny<CancellationToken>())).ReturnsAsync(new MemoryStream(new byte[] { 9 }));

        // Act
        var result = await Build(service).DownloadAttachment(ItemId, CancellationToken.None);

        // Assert
        var file = Assert.IsType<FileStreamResult>(result);
        Assert.Equal("application/pdf", file.ContentType);
        Assert.Equal("playbook.pdf", file.FileDownloadName);
    }

    [Fact]
    public async Task Download_Denied_Returns403()
    {
        var service = new Mock<IToolkitService>();
        service.Setup(s => s.GetForDownloadAsync(ItemId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ToolkitDownloadResult(ToolkitDownloadOutcome.Denied));
        var result = await Build(service).DownloadAttachment(ItemId, CancellationToken.None);
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Download_NoAttachment_Returns404()
    {
        var service = new Mock<IToolkitService>();
        service.Setup(s => s.GetForDownloadAsync(ItemId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ToolkitDownloadResult(ToolkitDownloadOutcome.NoAttachment));
        var result = await Build(service).DownloadAttachment(ItemId, CancellationToken.None);
        Assert.Equal(StatusCodes.Status404NotFound, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Retire_CancellationPropagates()
    {
        // Arrange
        var service = new Mock<IToolkitService>();
        service.Setup(s => s.RetireAsync(ItemId, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>())).ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() => Build(service).RetireItem(ItemId, cts.Token));
    }
}
