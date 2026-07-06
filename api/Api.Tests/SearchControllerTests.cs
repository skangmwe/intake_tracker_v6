// Unit tests for SearchController (routing / status-code mapping only — the service is mocked).
// Covers the quick-search happy path (200 + hits), an empty result (200 + []), the full-search happy
// path (200 + page), the page-size-over-100 rejection (400, service never called — api/CLAUDE.md), and
// cancellation-token propagation (api-testing-guidelines.md). Access itself is enforced inside the
// procs (a non-member gets an empty result, never a 403) — exercised by the tSQLt proc tests.

using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Modules.Search;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class SearchControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid WorkspaceId = Guid.NewGuid();

    private static SearchController Build(Mock<ISearchService> search)
    {
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        return new SearchController(search.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    [Fact]
    public async Task Search_Success_ReturnsOkWithHits()
    {
        // Arrange
        var hits = new List<SearchHitDto> { new("AIS-00000001", "Contract helper", "intake", "AI Solutions") };
        var search = new Mock<ISearchService>();
        search.Setup(service => service.SearchRecordsAsync(WorkspaceId, UserId, "contract", It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(hits);

        // Act
        var result = await Build(search).Search("contract", WorkspaceId, CancellationToken.None);

        // Assert
        Assert.Same(hits, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task Search_NoMatches_ReturnsOkEmpty()
    {
        // Arrange — a non-member (or a query that matches nothing) yields an empty list, never a 403.
        var search = new Mock<ISearchService>();
        search.Setup(service => service.SearchRecordsAsync(It.IsAny<Guid>(), UserId, It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<SearchHitDto>());

        // Act
        var result = await Build(search).Search("nothing", WorkspaceId, CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Empty(Assert.IsAssignableFrom<IReadOnlyList<SearchHitDto>>(ok.Value));
    }

    [Fact]
    public async Task SearchFull_Success_ReturnsOkWithPage()
    {
        // Arrange
        var page = new PaginatedResponse<SearchResultDto>(
            new List<SearchResultDto> { new("AIS-00000001", "Omega helper", "intake", "AI Solutions", "record", "body") },
            1, 1, 20);
        var search = new Mock<ISearchService>();
        search.Setup(service => service.SearchFullAsync(WorkspaceId, UserId, "omega", 1, 20, It.IsAny<CancellationToken>()))
            .ReturnsAsync(page);

        // Act
        var result = await Build(search).SearchFull(
            new SearchFullRequest { Query = "omega", WorkspaceId = WorkspaceId, Page = 1, PageSize = 20 }, CancellationToken.None);

        // Assert
        Assert.Same(page, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task SearchFull_PageSizeOverMax_Returns400AndDoesNotCallService()
    {
        // Arrange
        var search = new Mock<ISearchService>();

        // Act
        var result = await Build(search).SearchFull(
            new SearchFullRequest { Query = "omega", WorkspaceId = WorkspaceId, Page = 1, PageSize = 101 }, CancellationToken.None);

        // Assert — validated at the boundary; the service is never called (never silently clamped).
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
        search.Verify(
            service => service.SearchFullAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Search_CancellationPropagates()
    {
        // Arrange
        var search = new Mock<ISearchService>();
        search.Setup(service => service.SearchRecordsAsync(It.IsAny<Guid>(), UserId, It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(search).Search("contract", WorkspaceId, cts.Token));
    }

    [Fact]
    public async Task SearchFull_CancellationPropagates()
    {
        // Arrange
        var search = new Mock<ISearchService>();
        search.Setup(service => service.SearchFullAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(search).SearchFull(new SearchFullRequest { Query = "omega", WorkspaceId = WorkspaceId, PageSize = 20 }, cts.Token));
    }
}
