using McDermott.AiTracker.Api.Modules.Ai.Config;
using McDermott.AiTracker.Api.Modules.Ai.Drafting;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public class FieldSuggestionControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid WorkspaceId = Guid.NewGuid();
    private static readonly IReadOnlyList<string> Allowlist = new[] { "Name", "Description", "WorkflowDetails" };

    private readonly Mock<IFieldSuggestionService> _service = new();
    private readonly Mock<IAiConfigService> _config = new();
    private readonly Mock<IAccessGuard> _accessGuard = new();
    private readonly Mock<ICurrentUser> _currentUser = new();

    public FieldSuggestionControllerTests()
    {
        _currentUser.SetupGet(user => user.UserId).Returns(UserId);
    }

    private FieldSuggestionController Build()
    {
        var controller = new FieldSuggestionController(
            _service.Object, _config.Object, _accessGuard.Object, _currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
        return controller;
    }

    private void GrantMember() =>
        _accessGuard
            .Setup(guard => guard.HasWorkspaceLevelAsync(UserId, WorkspaceId, WorkspaceLevel.Viewer, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

    private void ConfigEnabled(bool enabled) =>
        _config.Setup(config => config.GetAsync(WorkspaceId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiConfigDto(enabled, Allowlist));

    private static int? StatusOf(IActionResult result) => (result as ObjectResult)?.StatusCode;

    private static FieldSuggestionRequest Request(
        string targetFieldKey = "priority",
        IReadOnlyDictionary<string, string>? fields = null) =>
        new("Request", "LIT-9004", targetFieldKey,
            fields ?? new Dictionary<string, string> { ["Description"] = "Onboard Acme" }, null, null);

    [Fact]
    public async Task Suggest_NonMember_Returns403()
    {
        // Arrange — no membership granted.
        var sut = Build();

        // Act
        var result = await sut.Suggest(WorkspaceId, Request(), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, StatusOf(result));
        _service.Verify(service => service.SuggestAsync(
            It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<IReadOnlyDictionary<string, string>>(), It.IsAny<IReadOnlyList<string>?>(),
            It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Suggest_Disabled_Returns403_ServiceNeverCalled()
    {
        // Arrange — member, but AI assist is off.
        GrantMember();
        ConfigEnabled(false);
        var sut = Build();

        // Act
        var result = await sut.Suggest(WorkspaceId, Request(), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, StatusOf(result));
        _service.Verify(service => service.SuggestAsync(
            It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<IReadOnlyDictionary<string, string>>(), It.IsAny<IReadOnlyList<string>?>(),
            It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Suggest_EmptyTargetFieldKey_Returns400()
    {
        // Arrange
        GrantMember();
        ConfigEnabled(true);
        var sut = Build();

        // Act
        var result = await sut.Suggest(WorkspaceId, Request(targetFieldKey: "  "), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status400BadRequest, StatusOf(result));
        _service.Verify(service => service.SuggestAsync(
            It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<IReadOnlyDictionary<string, string>>(), It.IsAny<IReadOnlyList<string>?>(),
            It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Suggest_MemberEnabled_Returns200WithSuggestion()
    {
        // Arrange
        GrantMember();
        ConfigEnabled(true);
        var suggestion = new FieldSuggestion("High", "Time-sensitive request.");
        _service.Setup(service => service.SuggestAsync(
                WorkspaceId, UserId, "Request", "priority",
                It.IsAny<IReadOnlyDictionary<string, string>>(), It.IsAny<IReadOnlyList<string>?>(),
                It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(suggestion);
        var sut = Build();

        // Act
        var result = await sut.Suggest(WorkspaceId, Request(), CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Same(suggestion, ok.Value);
        Assert.Equal("private, no-store", sut.Response.Headers.CacheControl);
    }

    [Fact]
    public async Task Suggest_ForwardsOnlyAllowlistedKeysToService()
    {
        // Arrange — the client sends an off-allowlist client-matter key alongside an allowlisted one.
        GrantMember();
        ConfigEnabled(true);
        IReadOnlyDictionary<string, string>? forwarded = null;
        _service.Setup(service => service.SuggestAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<IReadOnlyDictionary<string, string>>(), It.IsAny<IReadOnlyList<string>?>(),
                It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .Callback<Guid, Guid, string, string, IReadOnlyDictionary<string, string>, IReadOnlyList<string>?, string?, CancellationToken>(
                (_, _, _, _, context, _, _, _) => forwarded = context)
            .ReturnsAsync(new FieldSuggestion(null, "No confident suggestion."));
        var fields = new Dictionary<string, string>
        {
            ["description"] = "Onboard Acme",       // camelCase field key → canonical "Description"
            ["clientNumber"] = "MATTER-123-SECRET", // off-allowlist client-matter field
        };
        var sut = Build();

        // Act
        await sut.Suggest(WorkspaceId, Request(fields: fields), CancellationToken.None);

        // Assert — the allowlisted field is forwarded under its canonical name; the client-matter field is dropped.
        Assert.NotNull(forwarded);
        Assert.True(forwarded!.ContainsKey("Description"));
        Assert.False(forwarded.ContainsKey("clientNumber"));
        Assert.False(forwarded.ContainsKey("ClientNumber"));
    }
}
