using System.Text;
using McDermott.AiTracker.Api.Modules.Ai.Chat;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public class AskControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid WorkspaceId = Guid.NewGuid();
    private static readonly Guid ConversationId = Guid.NewGuid();
    private static readonly Guid MessageId = Guid.NewGuid();

    private readonly Mock<IAskService> _ask = new();
    private readonly Mock<IAiConversationStore> _store = new();
    private readonly Mock<IAccessGuard> _accessGuard = new();
    private readonly Mock<ICurrentUser> _currentUser = new();

    public AskControllerTests()
    {
        _currentUser.SetupGet(user => user.UserId).Returns(UserId);
    }

    private AskController Build(HttpContext? httpContext = null)
    {
        var controller = new AskController(_ask.Object, _store.Object, _accessGuard.Object, _currentUser.Object);
        controller.ControllerContext = new ControllerContext { HttpContext = httpContext ?? new DefaultHttpContext() };
        return controller;
    }

    private void GrantMember() =>
        _accessGuard
            .Setup(guard => guard.HasWorkspaceLevelAsync(UserId, WorkspaceId, WorkspaceLevel.Viewer, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

    private static int? StatusOf(IActionResult result) => (result as ObjectResult)?.StatusCode;

    private static async IAsyncEnumerable<AskEvent> Sequence(params AskEvent[] events)
    {
        foreach (var streamEvent in events)
        {
            yield return streamEvent;
            await Task.Yield();
        }
    }

    [Fact]
    public async Task CreateConversation_NonMember_Returns403()
    {
        // Arrange
        var sut = Build();

        // Act
        var result = await sut.CreateConversation(WorkspaceId, new CreateConversationRequest("t"), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, StatusOf(result));
        _store.Verify(store => store.CreateAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task CreateConversation_Member_ReturnsId()
    {
        // Arrange
        GrantMember();
        _store.Setup(store => store.CreateAsync(WorkspaceId, UserId, "t", It.IsAny<CancellationToken>()))
            .ReturnsAsync(ConversationId);
        var sut = Build();

        // Act
        var result = await sut.CreateConversation(WorkspaceId, new CreateConversationRequest("t"), CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        var body = Assert.IsType<ConversationCreatedResponse>(ok.Value);
        Assert.Equal(ConversationId, body.ConversationId);
    }

    [Fact]
    public async Task ListConversations_Member_ReturnsOwnPage()
    {
        // Arrange
        GrantMember();
        var summaries = new List<AiConversationSummary>
        {
            new(ConversationId, "First", DateTime.UtcNow, DateTime.UtcNow),
        };
        _store.Setup(store => store.ListAsync(WorkspaceId, UserId, 1, 20, It.IsAny<CancellationToken>()))
            .ReturnsAsync((summaries, 1));
        var sut = Build();

        // Act
        var result = await sut.ListConversations(WorkspaceId, 1, 20, CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        var page = Assert.IsType<PaginatedResponse<AiConversationSummaryResponse>>(ok.Value);
        Assert.Equal(1, page.TotalCount);
        Assert.Single(page.Items);
    }

    [Fact]
    public async Task ListConversations_PageSizeTooLarge_Returns400()
    {
        // Arrange
        GrantMember();
        var sut = Build();

        // Act
        var result = await sut.ListConversations(WorkspaceId, 1, 500, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status400BadRequest, StatusOf(result));
    }

    [Fact]
    public async Task GetConversation_ForeignConversation_Returns404()
    {
        // Arrange - the store's ownership gate throws for a conversation the caller does not own.
        GrantMember();
        _store.Setup(store => store.LoadAsync(ConversationId, UserId, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new KeyNotFoundException());
        var sut = Build();

        // Act
        var result = await sut.GetConversation(WorkspaceId, ConversationId, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status404NotFound, StatusOf(result));
    }

    [Fact]
    public async Task Ask_NonMember_Returns403()
    {
        // Arrange
        var sut = Build();

        // Act
        var result = await sut.Ask(WorkspaceId, ConversationId, new AskRequest("hi", null), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, StatusOf(result));
        _ask.Verify(ask => ask.AskAsync(
            It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Ask_EmptyQuery_Returns400()
    {
        // Arrange
        GrantMember();
        var sut = Build();

        // Act
        var result = await sut.Ask(WorkspaceId, ConversationId, new AskRequest("   ", null), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status400BadRequest, StatusOf(result));
    }

    [Fact]
    public async Task Ask_Member_WritesSseFrames()
    {
        // Arrange - the service yields a token then a citation; the controller must frame them as SSE.
        GrantMember();
        _ask.Setup(ask => ask.AskAsync(WorkspaceId, UserId, ConversationId, "hi", null, It.IsAny<CancellationToken>()))
            .Returns(Sequence(
                new AskEvent("token", "{\"text\":\"hi\"}"),
                new AskEvent("citation", "{\"marker\":1,\"recordId\":\"LIT-9004\"}")));
        var httpContext = new DefaultHttpContext();
        httpContext.Response.Body = new MemoryStream();
        var sut = Build(httpContext);

        // Act
        var result = await sut.Ask(WorkspaceId, ConversationId, new AskRequest("hi", null), CancellationToken.None);

        // Assert - SSE content type + framed events.
        Assert.IsType<EmptyResult>(result);
        Assert.Equal("text/event-stream", httpContext.Response.ContentType);
        httpContext.Response.Body.Position = 0;
        var body = Encoding.UTF8.GetString(((MemoryStream)httpContext.Response.Body).ToArray());
        Assert.Contains("event: token", body);
        Assert.Contains("event: citation", body);
        Assert.Contains("LIT-9004", body);
    }

    [Fact]
    public async Task SetFeedback_InvalidRating_Returns400()
    {
        // Arrange
        GrantMember();
        var sut = Build();

        // Act
        var result = await sut.SetFeedback(WorkspaceId, MessageId, new MessageFeedbackRequest("meh"), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status400BadRequest, StatusOf(result));
        _store.Verify(store => store.SetFeedbackAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task SetFeedback_Member_Returns204()
    {
        // Arrange
        GrantMember();
        var sut = Build();

        // Act
        var result = await sut.SetFeedback(WorkspaceId, MessageId, new MessageFeedbackRequest("up"), CancellationToken.None);

        // Assert
        Assert.IsType<NoContentResult>(result);
        _store.Verify(store => store.SetFeedbackAsync(MessageId, UserId, "up", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task SetFeedback_ForeignMessage_Returns404()
    {
        // Arrange
        GrantMember();
        _store.Setup(store => store.SetFeedbackAsync(MessageId, UserId, "down", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new KeyNotFoundException());
        var sut = Build();

        // Act
        var result = await sut.SetFeedback(WorkspaceId, MessageId, new MessageFeedbackRequest("down"), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status404NotFound, StatusOf(result));
    }
}
