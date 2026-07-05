// Unit tests for AttachmentsController (routing / boundary validation / status-code mapping only —
// the service is mocked). Covers upload validation (missing file 400, filename sanitize, disallowed
// content-type 400, oversize 413), the upload outcome mapping (201 / 403 / 502 / 500), link
// validation + mapping, download (native File / link redirect / 403), delete (204 / 403), and
// cancellation propagation (api-testing-guidelines.md). Access denials are 403, never 404 (BS §22.6).

using McDermott.AiTracker.Api.Modules.Attachments;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class AttachmentsControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private const string RecordId = "AIS-00000042";
    private const string Pdf = "application/pdf";

    private static AttachmentsController Build(Mock<IAttachmentsService> service, AttachmentsOptions? options = null)
    {
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        var httpContext = new DefaultHttpContext();
        httpContext.Items[OperationIdMiddleware.HeaderName] = "op-123";

        return new AttachmentsController(service.Object, currentUser.Object, Options.Create(options ?? new AttachmentsOptions()))
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

    private static AttachmentDto SampleDto(bool isLink = false) => new(
        Guid.NewGuid(), RecordId, "Request", "brief.pdf", Pdf, 2048, isLink, isLink ? "https://x" : null,
        DateTime.UtcNow, UserId, "/api/v1/attachments/x/content");

    [Fact]
    public async Task Upload_NoFile_Returns400()
    {
        // Arrange
        var service = new Mock<IAttachmentsService>();

        // Act
        var result = await Build(service).UploadAttachment(RecordId, null, CancellationToken.None);

        // Assert — validated at the boundary; the service is never called.
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsType<ObjectResult>(result).StatusCode);
        service.Verify(s => s.UploadAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<long>(),
            It.IsAny<Stream>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Upload_FilenameSanitizesToEmpty_Returns400()
    {
        // Arrange — a name that is only a path separator sanitizes to empty via Path.GetFileName.
        var service = new Mock<IAttachmentsService>();

        // Act
        var result = await Build(service).UploadAttachment(RecordId, FakeFile("/", Pdf, 10), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Upload_DisallowedContentType_Returns400()
    {
        // Arrange
        var service = new Mock<IAttachmentsService>();

        // Act
        var result = await Build(service).UploadAttachment(RecordId, FakeFile("x.exe", "application/x-msdownload", 10), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Upload_Oversize_Returns413()
    {
        // Arrange — a 2-byte cap makes any real file too large.
        var service = new Mock<IAttachmentsService>();
        var options = new AttachmentsOptions { MaxFileBytes = 2 };

        // Act
        var result = await Build(service, options).UploadAttachment(RecordId, FakeFile("big.pdf", Pdf, 5), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status413RequestEntityTooLarge, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Theory]
    [InlineData(AttachmentOutcome.Denied, StatusCodes.Status403Forbidden)]
    [InlineData(AttachmentOutcome.BlobFailed, StatusCodes.Status502BadGateway)]
    [InlineData(AttachmentOutcome.PersistFailed, StatusCodes.Status500InternalServerError)]
    public async Task Upload_FailureOutcomes_MapToStatus(AttachmentOutcome outcome, int expected)
    {
        // Arrange
        var service = new Mock<IAttachmentsService>();
        service.Setup(s => s.UploadAsync(RecordId, "ok.pdf", Pdf, 10, It.IsAny<Stream>(), UserId, "op-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new UploadResult(outcome));

        // Act
        var result = await Build(service).UploadAttachment(RecordId, FakeFile("ok.pdf", Pdf, 10), CancellationToken.None);

        // Assert
        Assert.Equal(expected, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Upload_Success_Returns201()
    {
        // Arrange
        var dto = SampleDto();
        var service = new Mock<IAttachmentsService>();
        service.Setup(s => s.UploadAsync(RecordId, "ok.pdf", Pdf, 10, It.IsAny<Stream>(), UserId, "op-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new UploadResult(AttachmentOutcome.Success, dto));

        // Act
        var result = await Build(service).UploadAttachment(RecordId, FakeFile("ok.pdf", Pdf, 10), CancellationToken.None);

        // Assert
        Assert.Same(dto, Assert.IsType<CreatedResult>(result).Value);
    }

    [Fact]
    public async Task Upload_StripsDirectoryFromFilename()
    {
        // Arrange — a traversal-shaped name is reduced to its leaf before the service sees it.
        var service = new Mock<IAttachmentsService>();
        service.Setup(s => s.UploadAsync(RecordId, "evil.pdf", Pdf, 10, It.IsAny<Stream>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new UploadResult(AttachmentOutcome.Success, SampleDto()));

        // Act
        await Build(service).UploadAttachment(RecordId, FakeFile("../../evil.pdf", Pdf, 10), CancellationToken.None);

        // Assert — the service was called with the sanitized leaf, never the traversal path.
        service.Verify(s => s.UploadAsync(RecordId, "evil.pdf", Pdf, 10, It.IsAny<Stream>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Link_InvalidUrl_Returns400()
    {
        // Arrange
        var service = new Mock<IAttachmentsService>();

        // Act
        var result = await Build(service).LinkAttachment(RecordId, new AttachmentLinkRequest { Url = "ftp://x", Title = "Spec" }, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Link_EmptyTitle_Returns400()
    {
        // Arrange
        var service = new Mock<IAttachmentsService>();

        // Act
        var result = await Build(service).LinkAttachment(RecordId, new AttachmentLinkRequest { Url = "https://x", Title = "  " }, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Link_Success_Returns201()
    {
        // Arrange
        var dto = SampleDto(isLink: true);
        var service = new Mock<IAttachmentsService>();
        service.Setup(s => s.LinkAsync(RecordId, "https://x", "Spec", UserId, "op-123", It.IsAny<CancellationToken>())).ReturnsAsync(dto);

        // Act
        var result = await Build(service).LinkAttachment(RecordId, new AttachmentLinkRequest { Url = "https://x", Title = "Spec" }, CancellationToken.None);

        // Assert
        Assert.Same(dto, Assert.IsType<CreatedResult>(result).Value);
    }

    [Fact]
    public async Task Link_Denied_Returns403()
    {
        // Arrange
        var service = new Mock<IAttachmentsService>();
        service.Setup(s => s.LinkAsync(RecordId, "https://x", "Spec", UserId, It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((AttachmentDto?)null);

        // Act
        var result = await Build(service).LinkAttachment(RecordId, new AttachmentLinkRequest { Url = "https://x", Title = "Spec" }, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task List_Denied_Returns403()
    {
        // Arrange
        var service = new Mock<IAttachmentsService>();
        service.Setup(s => s.ListAsync(RecordId, UserId, It.IsAny<CancellationToken>())).ReturnsAsync((IReadOnlyList<AttachmentDto>?)null);

        // Act
        var result = await Build(service).ListAttachments(RecordId, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task List_Accessible_ReturnsOk()
    {
        // Arrange
        var list = new List<AttachmentDto> { SampleDto() };
        var service = new Mock<IAttachmentsService>();
        service.Setup(s => s.ListAsync(RecordId, UserId, It.IsAny<CancellationToken>())).ReturnsAsync(list);

        // Act
        var result = await Build(service).ListAttachments(RecordId, CancellationToken.None);

        // Assert
        Assert.Same(list, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task Download_Native_ReturnsFileStream()
    {
        // Arrange
        var id = Guid.NewGuid();
        var download = new AttachmentDownload(false, null, "the/path", "brief.pdf", Pdf);
        var service = new Mock<IAttachmentsService>();
        service.Setup(s => s.GetForDownloadAsync(id, UserId, It.IsAny<CancellationToken>())).ReturnsAsync(download);
        service.Setup(s => s.GetContentStreamAsync(download, It.IsAny<CancellationToken>())).ReturnsAsync(new MemoryStream(new byte[] { 9 }));

        // Act
        var result = await Build(service).DownloadAttachment(id, CancellationToken.None);

        // Assert
        var file = Assert.IsType<FileStreamResult>(result);
        Assert.Equal(Pdf, file.ContentType);
        Assert.Equal("brief.pdf", file.FileDownloadName);
    }

    [Fact]
    public async Task Download_Link_Redirects()
    {
        // Arrange
        var id = Guid.NewGuid();
        var service = new Mock<IAttachmentsService>();
        service.Setup(s => s.GetForDownloadAsync(id, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AttachmentDownload(true, "https://example.com/spec", "external", "Spec", "text/uri-list"));

        // Act
        var result = await Build(service).DownloadAttachment(id, CancellationToken.None);

        // Assert
        Assert.Equal("https://example.com/spec", Assert.IsType<RedirectResult>(result).Url);
    }

    [Fact]
    public async Task Download_Denied_Returns403()
    {
        // Arrange
        var id = Guid.NewGuid();
        var service = new Mock<IAttachmentsService>();
        service.Setup(s => s.GetForDownloadAsync(id, UserId, It.IsAny<CancellationToken>())).ReturnsAsync((AttachmentDownload?)null);

        // Act
        var result = await Build(service).DownloadAttachment(id, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Delete_Success_Returns204()
    {
        // Arrange
        var id = Guid.NewGuid();
        var service = new Mock<IAttachmentsService>();
        service.Setup(s => s.DeleteAsync(id, UserId, "op-123", It.IsAny<CancellationToken>())).ReturnsAsync(true);

        // Act
        var result = await Build(service).DeleteAttachment(id, CancellationToken.None);

        // Assert
        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task Delete_Denied_Returns403()
    {
        // Arrange
        var id = Guid.NewGuid();
        var service = new Mock<IAttachmentsService>();
        service.Setup(s => s.DeleteAsync(id, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(false);

        // Act
        var result = await Build(service).DeleteAttachment(id, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Delete_CancellationPropagates()
    {
        // Arrange
        var id = Guid.NewGuid();
        var service = new Mock<IAttachmentsService>();
        service.Setup(s => s.DeleteAsync(id, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>())).ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() => Build(service).DeleteAttachment(id, cts.Token));
    }
}
