// Unit tests for CommentsController (routing / status-code mapping only — the service is mocked) and
// the pure CommentsService.SummariseEvent helper. Covers the post happy path (201), the empty-body
// 400, the access-denied 403 (never 404 — BS §22.6) on both post and thread, cancellation-token
// propagation, and the per-event-type summary composition (api-testing-guidelines.md).

using McDermott.AiTracker.Api.Modules.Comments;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class CommentsControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private const string RecordId = "AI-00000042";

    private static CommentsController Build(Mock<ICommentsService> comments)
    {
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        var httpContext = new DefaultHttpContext();
        httpContext.Items[OperationIdMiddleware.HeaderName] = "op-123";

        return new CommentsController(comments.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
    }

    private static CommentDto SampleComment() => new(
        Guid.NewGuid(), RecordId, "Request", UserId, "Looks good", Array.Empty<Guid>(), DateTime.UtcNow);

    [Fact]
    public async Task PostComment_Success_Returns201()
    {
        // Arrange
        var comment = SampleComment();
        var comments = new Mock<ICommentsService>();
        comments.Setup(service => service.PostCommentAsync(RecordId, It.IsAny<CommentCreateRequest>(), UserId, "op-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(comment);

        // Act
        var result = await Build(comments).PostComment(RecordId, new CommentCreateRequest { Body = "Looks good" }, CancellationToken.None);

        // Assert
        var created = Assert.IsType<CreatedResult>(result);
        Assert.Same(comment, created.Value);
    }

    [Fact]
    public async Task PostComment_EmptyBody_Returns400()
    {
        // Arrange
        var comments = new Mock<ICommentsService>();

        // Act
        var result = await Build(comments).PostComment(RecordId, new CommentCreateRequest { Body = "   " }, CancellationToken.None);

        // Assert — validated at the boundary; the service is never called.
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
        comments.Verify(
            service => service.PostCommentAsync(It.IsAny<string>(), It.IsAny<CommentCreateRequest>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task PostComment_NoAccess_Returns403()
    {
        // Arrange — a forbidden OR non-existent record comes back null and maps to 403 (never 404).
        var comments = new Mock<ICommentsService>();
        comments.Setup(service => service.PostCommentAsync(RecordId, It.IsAny<CommentCreateRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((CommentDto?)null);

        // Act
        var result = await Build(comments).PostComment(RecordId, new CommentCreateRequest { Body = "hi" }, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task GetThread_Accessible_ReturnsOk()
    {
        // Arrange
        var thread = new List<ActivityThreadItemDto>
        {
            new("event", null, new AuditEventItemDto("request.created", DateTime.UtcNow, UserId, "Request created")),
            new("comment", SampleComment(), null),
        };
        var comments = new Mock<ICommentsService>();
        comments.Setup(service => service.GetThreadAsync(RecordId, UserId, It.IsAny<CancellationToken>())).ReturnsAsync(thread);

        // Act
        var result = await Build(comments).GetThread(RecordId, CancellationToken.None);

        // Assert
        Assert.Same(thread, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task GetThread_EmptyButAccessible_ReturnsOk()
    {
        // Arrange — an accessible record with no activity yet returns [] (200), not 403.
        var comments = new Mock<ICommentsService>();
        comments.Setup(service => service.GetThreadAsync(RecordId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<ActivityThreadItemDto>());

        // Act
        var result = await Build(comments).GetThread(RecordId, CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Empty(Assert.IsAssignableFrom<IReadOnlyList<ActivityThreadItemDto>>(ok.Value));
    }

    [Fact]
    public async Task GetThread_NoAccess_Returns403()
    {
        // Arrange — null distinguishes "cannot see the record" from "empty thread".
        var comments = new Mock<ICommentsService>();
        comments.Setup(service => service.GetThreadAsync(RecordId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((IReadOnlyList<ActivityThreadItemDto>?)null);

        // Act
        var result = await Build(comments).GetThread(RecordId, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task PostComment_CancellationPropagates()
    {
        // Arrange
        var comments = new Mock<ICommentsService>();
        comments.Setup(service => service.PostCommentAsync(RecordId, It.IsAny<CommentCreateRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(comments).PostComment(RecordId, new CommentCreateRequest { Body = "hi" }, cts.Token));
    }
}

public sealed class SummariseEventTests
{
    [Theory]
    [InlineData("request.created", null, "Request created")]
    [InlineData("request.updated", null, "Details updated")]
    [InlineData("request.stage-changed", "{\"toStage\":\"build\"}", "Moved to build")]
    [InlineData("request.stage-changed", null, "Stage changed")]
    [InlineData("request.hold-changed", "{\"held\":true}", "Placed on hold")]
    [InlineData("request.hold-changed", "{\"held\":false}", "Hold cleared")]
    public void SummariseEvent_KnownEvents_ComposeReadableText(string eventType, string? payload, string expected)
    {
        // Act
        var summary = CommentsService.SummariseEvent(eventType, payload);

        // Assert
        Assert.Equal(expected, summary);
    }

    [Fact]
    public void SummariseEvent_UnknownEvent_IsPrettified()
    {
        // Act
        var summary = CommentsService.SummariseEvent("escalation.opened", null);

        // Assert — a fallback humanises the type; never a raw dotted token.
        Assert.Equal("Escalation opened", summary);
    }
}
