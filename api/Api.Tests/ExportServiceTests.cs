// Unit tests for ExportService (Slice 16 — Export view, BS §13). ExportService has no DbContext — it
// composes ISavedViewsService (the view), IRequestsService.QueryAsync (already access-filtered rows),
// and IAccessGuard (the workspace gate), all mocked. Covers: 404 unknown view, 400 non-Request view,
// 403 personal-view-not-owned, 403 not-a-member, the happy path (paged rows → CSV with a BOM), and
// cancellation.

using System.Collections.Generic;
using System.Text;
using System.Text.Json;
using McDermott.AiTracker.Api.Modules.ImportExport;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Modules.SavedViews;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class ExportServiceTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid WorkspaceId = new("1A150000-0000-4000-8000-000000000001");
    private static readonly Guid ViewId = new("5A5E0000-0000-4000-8000-000000000001");

    private readonly Mock<ISavedViewsService> _savedViews = new();
    private readonly Mock<IRequestsService> _requests = new();
    private readonly Mock<IAccessGuard> _accessGuard = new();

    private ExportService Build() =>
        new(_savedViews.Object, _requests.Object, _accessGuard.Object, Options.Create(new ImportExportOptions()));

    private static SavedViewResponse View(
        string objectType = "Request", string scope = "shared", Guid? owner = null,
        IReadOnlyList<string>? columns = null) => new(
        Id: ViewId,
        WorkspaceId: WorkspaceId,
        ObjectType: objectType,
        Name: "My view",
        Scope: scope,
        IsDefault: false,
        Columns: columns ?? new[] { "id", "name" },
        Filters: new Dictionary<string, JsonElement>(),
        Sort: System.Array.Empty<SavedViewSortEntry>(),
        OwnerUserId: owner ?? UserId,
        CreatedBy: UserId.ToString(),
        CreatedAt: DateTime.UtcNow,
        UpdatedAt: DateTime.UtcNow);

    private void SetupView(SavedViewResponse? view) =>
        _savedViews.Setup(service => service.GetByIdAsync(ViewId, It.IsAny<CancellationToken>())).ReturnsAsync(view);

    private void AllowMembership() =>
        _accessGuard
            .Setup(guard => guard.HasWorkspaceLevelAsync(UserId, WorkspaceId, WorkspaceLevel.Viewer, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

    [Fact]
    public async Task ExportAsync_UnknownView_ReturnsNotFound()
    {
        SetupView(null);
        var result = await Build().ExportAsync(ViewId, UserId, CancellationToken.None);
        Assert.Equal(ExportOutcome.NotFound, result.Outcome);
    }

    [Fact]
    public async Task ExportAsync_NonRequestView_ReturnsUnsupported()
    {
        SetupView(View(objectType: "Feature"));
        var result = await Build().ExportAsync(ViewId, UserId, CancellationToken.None);
        Assert.Equal(ExportOutcome.Unsupported, result.Outcome);
    }

    [Fact]
    public async Task ExportAsync_PersonalViewNotOwned_ReturnsDenied()
    {
        // Arrange — a personal view owned by someone else is invisible to the caller.
        SetupView(View(scope: "personal", owner: Guid.NewGuid()));
        var result = await Build().ExportAsync(ViewId, UserId, CancellationToken.None);
        Assert.Equal(ExportOutcome.Denied, result.Outcome);
    }

    [Fact]
    public async Task ExportAsync_NotWorkspaceMember_ReturnsDenied()
    {
        // Arrange — a shared view the caller cannot see because they are not a member.
        SetupView(View());
        _accessGuard
            .Setup(guard => guard.HasWorkspaceLevelAsync(UserId, WorkspaceId, WorkspaceLevel.Viewer, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var result = await Build().ExportAsync(ViewId, UserId, CancellationToken.None);
        Assert.Equal(ExportOutcome.Denied, result.Outcome);
    }

    [Fact]
    public async Task ExportAsync_HappyPath_ReturnsCsvWithBomAndFileName()
    {
        // Arrange
        SetupView(View(columns: new[] { "id", "name" }));
        AllowMembership();
        var rows = new List<RequestListRow>
        {
            new("AIS-00000001", "e1", new Dictionary<string, object?> { ["id"] = "AIS-00000001", ["name"] = "Helper" }, null, RequestStatusHoldValue.InProgress),
        };
        _requests
            .Setup(service => service.QueryAsync(WorkspaceId, It.IsAny<PaginatedQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PaginatedResponse<RequestListRow>(rows, 1, 1, 100));

        // Act
        var result = await Build().ExportAsync(ViewId, UserId, CancellationToken.None);

        // Assert
        Assert.Equal(ExportOutcome.Success, result.Outcome);
        Assert.Equal("requests-export.csv", result.FileName);
        Assert.NotNull(result.Content);
        var bom = Encoding.UTF8.GetPreamble();
        Assert.True(result.Content!.Length > bom.Length);
        Assert.Equal(bom, result.Content.Take(bom.Length).ToArray());
        var text = Encoding.UTF8.GetString(result.Content, bom.Length, result.Content.Length - bom.Length);
        Assert.Contains("Record ID,Name", text);
        Assert.Contains("AIS-00000001,Helper", text);
    }

    [Fact]
    public async Task ExportAsync_CancellationPropagates()
    {
        SetupView(View());
        AllowMembership();
        _requests
            .Setup(service => service.QueryAsync(WorkspaceId, It.IsAny<PaginatedQuery>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAsync<OperationCanceledException>(() => Build().ExportAsync(ViewId, UserId, cts.Token));
    }
}
