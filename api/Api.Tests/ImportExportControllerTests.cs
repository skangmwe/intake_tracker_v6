// Unit tests for ImportExportController (Slice 16 — routing / boundary-validation / status-code mapping
// only; the services are mocked — api-coding-standards.md). Covers the CSV upload admin gate (403),
// boundary validation (no file 400, disallowed type 400, oversize 413), the 202 hand-off, the 502 blob
// failure, the status read (200 / 403-never-404), and the export success/404/403/400 paths, plus
// cancellation propagation.

using System.Text;
using McDermott.AiTracker.Api.Modules.ImportExport;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class ImportExportControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid WorkspaceId = new("1A150000-0000-4000-8000-000000000001");
    private static readonly Guid ImportId = new("33333333-3333-4333-8333-333333333333");
    private static readonly Guid ViewId = new("5A5E0000-0000-4000-8000-000000000001");

    private readonly Mock<IImportService> _imports = new();
    private readonly Mock<IExportService> _exports = new();
    private readonly Mock<IAccessGuard> _accessGuard = new();

    private ImportExportController Build()
    {
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);
        return new ImportExportController(
            _imports.Object, _exports.Object, _accessGuard.Object, currentUser.Object,
            Options.Create(new ImportExportOptions()))
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    private void AllowAdmin() =>
        _accessGuard
            .Setup(guard => guard.HasWorkspaceLevelAsync(UserId, WorkspaceId, WorkspaceLevel.WorkspaceAdmin, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

    private static IFormFile CsvFile(string content = "Name\nAlpha", string contentType = "text/csv", long? overrideLength = null)
    {
        var bytes = Encoding.UTF8.GetBytes(content);
        return new FormFile(new MemoryStream(bytes), 0, overrideLength ?? bytes.Length, "file", "import.csv")
        {
            Headers = new HeaderDictionary(),
            ContentType = contentType,
        };
    }

    [Fact]
    public async Task ImportCsv_NonAdmin_Returns403AndNeverStarts()
    {
        // Arrange — the admin gate fails.
        _accessGuard
            .Setup(guard => guard.HasWorkspaceLevelAsync(UserId, WorkspaceId, WorkspaceLevel.WorkspaceAdmin, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        // Act
        var result = await Build().ImportCsv(WorkspaceId, CsvFile(), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
        _imports.Verify(
            service => service.StartAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<Stream>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task ImportCsv_NoFile_Returns400()
    {
        AllowAdmin();
        var result = await Build().ImportCsv(WorkspaceId, null, CancellationToken.None);
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task ImportCsv_DisallowedContentType_Returns400()
    {
        AllowAdmin();
        var result = await Build().ImportCsv(WorkspaceId, CsvFile(contentType: "application/pdf"), CancellationToken.None);
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task ImportCsv_Oversize_Returns413()
    {
        AllowAdmin();
        // A declared length beyond the 5 MB default limit — rejected before streaming.
        var result = await Build().ImportCsv(WorkspaceId, CsvFile(overrideLength: 6_000_000), CancellationToken.None);
        Assert.Equal(StatusCodes.Status413RequestEntityTooLarge, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task ImportCsv_Success_Returns202WithImportId()
    {
        // Arrange
        AllowAdmin();
        _imports
            .Setup(service => service.StartAsync(WorkspaceId, It.IsAny<string>(), It.IsAny<Stream>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ImportStartResult(ImportStartOutcome.Success, ImportId));

        // Act
        var result = await Build().ImportCsv(WorkspaceId, CsvFile(), CancellationToken.None);

        // Assert
        var accepted = Assert.IsType<AcceptedResult>(result);
        var body = Assert.IsType<ImportStartResponseDto>(accepted.Value);
        Assert.Equal(ImportId, body.ImportId);
        Assert.Equal("Processing", body.Status);
    }

    [Fact]
    public async Task ImportCsv_BlobFailed_Returns502()
    {
        AllowAdmin();
        _imports
            .Setup(service => service.StartAsync(WorkspaceId, It.IsAny<string>(), It.IsAny<Stream>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ImportStartResult(ImportStartOutcome.BlobFailed));

        var result = await Build().ImportCsv(WorkspaceId, CsvFile(), CancellationToken.None);
        Assert.Equal(StatusCodes.Status502BadGateway, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task GetImportStatus_Found_Returns200()
    {
        // Arrange
        var status = new ImportStatusResponse(
            ImportId, WorkspaceId, UserId, DateTime.UtcNow, "Completed", 3, 3, System.Array.Empty<ImportFlaggedRowDto>());
        _imports.Setup(service => service.GetStatusAsync(ImportId, UserId, It.IsAny<CancellationToken>())).ReturnsAsync(status);

        // Act
        var result = await Build().GetImportStatus(ImportId, CancellationToken.None);

        // Assert
        Assert.Same(status, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task GetImportStatus_NotVisible_Returns403NotFound()
    {
        // Arrange — a forbidden or non-existent import both read as null → 403, never 404.
        _imports.Setup(service => service.GetStatusAsync(ImportId, UserId, It.IsAny<CancellationToken>())).ReturnsAsync((ImportStatusResponse?)null);

        // Act
        var result = await Build().GetImportStatus(ImportId, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Export_Success_ReturnsCsvFile()
    {
        // Arrange
        var bytes = Encoding.UTF8.GetBytes("Record ID,Name\r\nAIS-00000001,Helper\r\n");
        _exports
            .Setup(service => service.ExportAsync(ViewId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ExportResult(ExportOutcome.Success, bytes, "requests-export.csv"));

        // Act
        var result = await Build().Export(new ExportRequestBody { SavedViewId = ViewId }, CancellationToken.None);

        // Assert
        var file = Assert.IsType<FileContentResult>(result);
        Assert.Equal("text/csv", file.ContentType);
        Assert.Equal("requests-export.csv", file.FileDownloadName);
    }

    [Fact]
    public async Task Export_EmptyId_Returns400AndNeverExports()
    {
        var result = await Build().Export(new ExportRequestBody { SavedViewId = Guid.Empty }, CancellationToken.None);
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsType<ObjectResult>(result).StatusCode);
        _exports.Verify(service => service.ExportAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Export_NotFound_Returns404()
    {
        _exports.Setup(service => service.ExportAsync(ViewId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ExportResult(ExportOutcome.NotFound));
        var result = await Build().Export(new ExportRequestBody { SavedViewId = ViewId }, CancellationToken.None);
        Assert.Equal(StatusCodes.Status404NotFound, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Export_Denied_Returns403()
    {
        _exports.Setup(service => service.ExportAsync(ViewId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ExportResult(ExportOutcome.Denied));
        var result = await Build().Export(new ExportRequestBody { SavedViewId = ViewId }, CancellationToken.None);
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Export_Unsupported_Returns400()
    {
        _exports.Setup(service => service.ExportAsync(ViewId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ExportResult(ExportOutcome.Unsupported));
        var result = await Build().Export(new ExportRequestBody { SavedViewId = ViewId }, CancellationToken.None);
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task ImportCsv_CancellationPropagates()
    {
        AllowAdmin();
        _imports
            .Setup(service => service.StartAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<Stream>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAsync<OperationCanceledException>(() => Build().ImportCsv(WorkspaceId, CsvFile(), cts.Token));
    }
}
