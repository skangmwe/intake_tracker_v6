// Unit tests for FeaturesController (routing / status-code mapping — the service is mocked). Covers
// the list access gate (null → 403), audience-gated detail (403 on null, never disclosing existence),
// create/patch/publish/deprecate/add-to-catalog outcome mapping (Success→201/200, Stale→409,
// NoHubWorkspace→503, Denied/NotFound→403), and cancellation propagation (api-testing-guidelines.md).
// DB-backed behaviours (mint, ETag, maturity mirror, sourced-from stamp) are covered by tSQLt.

using McDermott.AiTracker.Api.Modules.Features;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class FeaturesControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid WorkspaceId = Guid.NewGuid();
    private const string RecordId = "AIS-00000009";

    private static FeatureDto SampleFeature(string maturity = "Draft") => new(
        RecordId, WorkspaceId, DateTime.UtcNow, DateTime.UtcNow, "creator", "editor",
        "Citation overlay", "Highlight source lines", "Draws boxes", "UI/visual",
        Array.Empty<string>(), Array.Empty<string>(), Array.Empty<string>(), "Lift the component",
        null, null, "owner", maturity, null, Array.Empty<string>(), Array.Empty<string>(), "AAAAAAAAAAE=");

    private static FeaturesController Build(Mock<IFeaturesService> service)
    {
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);
        return new FeaturesController(service.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    [Fact]
    public async Task Query_Member_ReturnsOkWithPage()
    {
        // Arrange
        var page = new PaginatedResponse<FeatureListRowDto>(Array.Empty<FeatureListRowDto>(), 0, 1, 20);
        var service = new Mock<IFeaturesService>();
        service.Setup(svc => svc.QueryAsync(UserId, It.IsAny<PaginatedQuery>(), It.IsAny<CancellationToken>())).ReturnsAsync(page);

        // Act
        var result = await Build(service).QueryFeatures(new PaginatedQuery(), CancellationToken.None);

        // Assert
        Assert.Same(page, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task Query_NonMember_Returns403()
    {
        // Arrange — null means the caller is not an AI-workspace member.
        var service = new Mock<IFeaturesService>();
        service.Setup(svc => svc.QueryAsync(UserId, It.IsAny<PaginatedQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((PaginatedResponse<FeatureListRowDto>?)null);

        // Act
        var result = await Build(service).QueryFeatures(new PaginatedQuery(), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task GetById_Found_ReturnsOk()
    {
        // Arrange
        var service = new Mock<IFeaturesService>();
        service.Setup(svc => svc.GetByIdAsync(RecordId, UserId, It.IsAny<CancellationToken>())).ReturnsAsync(SampleFeature());

        // Act
        var result = await Build(service).GetFeature(RecordId, CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task GetById_NotVisible_Returns403()
    {
        // Arrange — null → 403, never disclosing existence (BS §22.6).
        var service = new Mock<IFeaturesService>();
        service.Setup(svc => svc.GetByIdAsync(RecordId, UserId, It.IsAny<CancellationToken>())).ReturnsAsync((FeatureDto?)null);

        // Act
        var result = await Build(service).GetFeature(RecordId, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Create_Success_Returns201()
    {
        // Arrange
        var service = new Mock<IFeaturesService>();
        service.Setup(svc => svc.CreateAsync(It.IsAny<FeatureCreateRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FeatureWriteResult(FeatureWriteOutcome.Success, SampleFeature()));

        // Act
        var result = await Build(service).CreateFeature(new FeatureCreateRequest { Name = "F", FeatureType = "UI/visual" }, CancellationToken.None);

        // Assert
        Assert.IsType<CreatedResult>(result);
    }

    [Fact]
    public async Task Create_Denied_Returns403()
    {
        // Arrange — not a Member+ of the AI Solutions workspace.
        var service = new Mock<IFeaturesService>();
        service.Setup(svc => svc.CreateAsync(It.IsAny<FeatureCreateRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FeatureWriteResult(FeatureWriteOutcome.Denied));

        // Act
        var result = await Build(service).CreateFeature(new FeatureCreateRequest { Name = "F", FeatureType = "UI/visual" }, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Create_NoHubWorkspace_Returns503()
    {
        // Arrange — no AI Solutions workspace is provisioned (misconfiguration).
        var service = new Mock<IFeaturesService>();
        service.Setup(svc => svc.CreateAsync(It.IsAny<FeatureCreateRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FeatureWriteResult(FeatureWriteOutcome.NoHubWorkspace));

        // Act
        var result = await Build(service).CreateFeature(new FeatureCreateRequest { Name = "F", FeatureType = "UI/visual" }, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Patch_Stale_Returns409()
    {
        // Arrange
        var service = new Mock<IFeaturesService>();
        service.Setup(svc => svc.PatchAsync(RecordId, It.IsAny<FeaturePatchRequest>(), It.IsAny<string?>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FeatureWriteResult(FeatureWriteOutcome.Stale));

        // Act
        var result = await Build(service).UpdateFeature(RecordId, new FeaturePatchRequest { IfMatch = "AAAAAAAAAAE=" }, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status409Conflict, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Patch_Success_ReturnsOk()
    {
        // Arrange
        var service = new Mock<IFeaturesService>();
        service.Setup(svc => svc.PatchAsync(RecordId, It.IsAny<FeaturePatchRequest>(), It.IsAny<string?>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FeatureWriteResult(FeatureWriteOutcome.Success, SampleFeature()));

        // Act
        var result = await Build(service).UpdateFeature(RecordId, new FeaturePatchRequest { IfMatch = "AAAAAAAAAAE=" }, CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task Publish_Success_ReturnsOk()
    {
        // Arrange
        var service = new Mock<IFeaturesService>();
        service.Setup(svc => svc.SetMaturityAsync(RecordId, "Published", UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FeatureWriteResult(FeatureWriteOutcome.Success, SampleFeature("Published")));

        // Act
        var result = await Build(service).PublishFeature(RecordId, CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task Deprecate_NotFound_Returns403()
    {
        // Arrange — a feature the caller cannot see returns NotFound → 403 (never disclose existence).
        var service = new Mock<IFeaturesService>();
        service.Setup(svc => svc.SetMaturityAsync(RecordId, "Deprecated", UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FeatureWriteResult(FeatureWriteOutcome.NotFound));

        // Act
        var result = await Build(service).DeprecateFeature(RecordId, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task AddToCatalog_Success_Returns201()
    {
        // Arrange
        var service = new Mock<IFeaturesService>();
        service.Setup(svc => svc.AddToCatalogAsync(RecordId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AddToCatalogServiceResult(AddToCatalogOutcome.Success, Guid.NewGuid()));

        // Act
        var result = await Build(service).AddToCatalog(RecordId, CancellationToken.None);

        // Assert
        Assert.IsType<CreatedResult>(result);
    }

    [Fact]
    public async Task AddToCatalog_DeniedSource_Returns403()
    {
        // Arrange — the source Request is not visible to the caller.
        var service = new Mock<IFeaturesService>();
        service.Setup(svc => svc.AddToCatalogAsync(RecordId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AddToCatalogServiceResult(AddToCatalogOutcome.DeniedSource));

        // Act
        var result = await Build(service).AddToCatalog(RecordId, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Query_CancellationPropagates()
    {
        // Arrange
        var service = new Mock<IFeaturesService>();
        service.Setup(svc => svc.QueryAsync(UserId, It.IsAny<PaginatedQuery>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(service).QueryFeatures(new PaginatedQuery(), cts.Token));
    }
}
