// Unit tests for EnsureUserMiddleware — first-request provisioning with a per-replica cache
// and best-effort failure handling (api-auth.md). Provisioning is mocked via IUserProvisioner
// so no database is touched.

using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class EnsureUserMiddlewareTests
{
    private static Mock<ICurrentUser> AuthenticatedUser(Guid id)
    {
        var user = new Mock<ICurrentUser>();
        user.SetupGet(candidate => candidate.IsAuthenticated).Returns(true);
        user.Setup(candidate => candidate.TryGetUserId()).Returns(id);
        user.SetupGet(candidate => candidate.DisplayName).Returns("Name");
        user.SetupGet(candidate => candidate.Email).Returns("user@example.test");
        return user;
    }

    private static IClock Clock()
    {
        var clock = new Mock<IClock>();
        clock.SetupGet(candidate => candidate.UtcNow).Returns(DateTimeOffset.UtcNow);
        return clock.Object;
    }

    private static (EnsureUserMiddleware Middleware, Mock<RequestDelegate> Next) Build()
    {
        var next = new Mock<RequestDelegate>();
        next.Setup(delegateMock => delegateMock(It.IsAny<HttpContext>())).Returns(Task.CompletedTask);
        return (new EnsureUserMiddleware(next.Object), next);
    }

    [Fact]
    public async Task Invoke_Unauthenticated_SkipsProvisioning()
    {
        // Arrange
        var (middleware, next) = Build();
        var user = new Mock<ICurrentUser>();
        user.SetupGet(candidate => candidate.IsAuthenticated).Returns(false);
        var provisioner = new Mock<IUserProvisioner>();

        // Act
        await middleware.InvokeAsync(
            new DefaultHttpContext(), user.Object, provisioner.Object, Clock(),
            NullLogger<EnsureUserMiddleware>.Instance);

        // Assert
        provisioner.Verify(
            p => p.ProvisionAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<DateTimeOffset>(), It.IsAny<CancellationToken>()),
            Times.Never);
        next.Verify(delegateMock => delegateMock(It.IsAny<HttpContext>()), Times.Once);
    }

    [Fact]
    public async Task Invoke_FirstAuthenticatedRequest_ProvisionsOnceThenCaches()
    {
        // Arrange
        var (middleware, next) = Build();
        var id = Guid.NewGuid();
        var user = AuthenticatedUser(id);
        var provisioner = new Mock<IUserProvisioner>();
        provisioner
            .Setup(p => p.ProvisionAsync(id, "Name", "user@example.test", It.IsAny<DateTimeOffset>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        // Act — two requests against the SAME middleware instance (same replica cache).
        await middleware.InvokeAsync(new DefaultHttpContext(), user.Object, provisioner.Object, Clock(), NullLogger<EnsureUserMiddleware>.Instance);
        await middleware.InvokeAsync(new DefaultHttpContext(), user.Object, provisioner.Object, Clock(), NullLogger<EnsureUserMiddleware>.Instance);

        // Assert — provisioned once, request continued both times.
        provisioner.Verify(
            p => p.ProvisionAsync(id, It.IsAny<string>(), It.IsAny<string>(), It.IsAny<DateTimeOffset>(), It.IsAny<CancellationToken>()),
            Times.Once);
        next.Verify(delegateMock => delegateMock(It.IsAny<HttpContext>()), Times.Exactly(2));
    }

    [Fact]
    public async Task Invoke_ProvisionFails_LogsAndContinuesAndRetriesNext()
    {
        // Arrange
        var (middleware, next) = Build();
        var id = Guid.NewGuid();
        var user = AuthenticatedUser(id);
        var provisioner = new Mock<IUserProvisioner>();
        provisioner
            .SetupSequence(p => p.ProvisionAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<DateTimeOffset>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("db down"))
            .Returns(Task.CompletedTask);

        // Act — first fails (not cached), second retries and succeeds.
        await middleware.InvokeAsync(new DefaultHttpContext(), user.Object, provisioner.Object, Clock(), NullLogger<EnsureUserMiddleware>.Instance);
        await middleware.InvokeAsync(new DefaultHttpContext(), user.Object, provisioner.Object, Clock(), NullLogger<EnsureUserMiddleware>.Instance);

        // Assert — the failure did not throw, both requests continued, provisioning retried.
        next.Verify(delegateMock => delegateMock(It.IsAny<HttpContext>()), Times.Exactly(2));
        provisioner.Verify(
            p => p.ProvisionAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<DateTimeOffset>(), It.IsAny<CancellationToken>()),
            Times.Exactly(2));
    }

    [Fact]
    public async Task Invoke_CancelledMidProvision_Rethrows()
    {
        // Arrange
        var (middleware, next) = Build();
        var user = AuthenticatedUser(Guid.NewGuid());
        var provisioner = new Mock<IUserProvisioner>();
        provisioner
            .Setup(p => p.ProvisionAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<DateTimeOffset>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        var context = new DefaultHttpContext { RequestAborted = cts.Token };

        // Act + Assert — a genuine client cancellation is not swallowed.
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            middleware.InvokeAsync(context, user.Object, provisioner.Object, Clock(), NullLogger<EnsureUserMiddleware>.Instance));
        next.Verify(delegateMock => delegateMock(It.IsAny<HttpContext>()), Times.Never);
    }
}
