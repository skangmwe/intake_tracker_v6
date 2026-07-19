// Pure-unit tests for RequestsService.ResolveLifecycle (Slice 27 — multi-lifecycle intake picker).
// Covers the resolution precedence: explicit picker choice > legacy request-type string > workspace
// default > first. api-testing-guidelines.md: happy path + each branch + boundary (id not found).

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Requests;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class RequestsResolveLifecycleTests
{
    private static readonly Guid StandardId = Guid.NewGuid();
    private static readonly Guid FastId = Guid.NewGuid();

    // Two workspace lifecycles — "Standard" is the default; "Fast track" is not.
    private static IReadOnlyList<LifecycleRow> Lifecycles() => new[]
    {
        new LifecycleRow { LifecycleId = StandardId, Name = "Standard", RequestType = "Standard", IsDefault = true, SortOrder = 0 },
        new LifecycleRow { LifecycleId = FastId, Name = "Fast track", RequestType = "Fast track", IsDefault = false, SortOrder = 1 },
    };

    [Fact]
    public void ResolveLifecycle_ExplicitId_WinsOverRequestTypeAndDefault()
    {
        // Arrange — the picker chose "Fast track" while a stale request-type string names the default.
        // Act
        var chosen = RequestsService.ResolveLifecycle(Lifecycles(), FastId, requestType: "Standard");

        // Assert — the explicit picker choice wins.
        Assert.Equal(FastId, chosen.LifecycleId);
    }

    [Fact]
    public void ResolveLifecycle_ExplicitIdNotInWorkspace_FallsThroughToRequestType()
    {
        // Arrange — an id from another workspace (never in this list) plus a matching request-type string.
        // Act
        var chosen = RequestsService.ResolveLifecycle(Lifecycles(), Guid.NewGuid(), requestType: "Fast track");

        // Assert — the foreign id is ignored; the request-type match resolves.
        Assert.Equal(FastId, chosen.LifecycleId);
    }

    [Fact]
    public void ResolveLifecycle_ExplicitIdNotFound_AndNoRequestTypeMatch_FallsToDefault()
    {
        // Arrange — neither the id nor the request-type string resolves.
        // Act
        var chosen = RequestsService.ResolveLifecycle(Lifecycles(), Guid.NewGuid(), requestType: "Nonexistent");

        // Assert — the workspace default.
        Assert.Equal(StandardId, chosen.LifecycleId);
    }

    [Fact]
    public void ResolveLifecycle_NoExplicitId_RequestTypeMatches()
    {
        // Arrange — the legacy CSV-import path: no picker id, a request-type string.
        // Act
        var chosen = RequestsService.ResolveLifecycle(Lifecycles(), explicitLifecycleId: null, requestType: "Fast track");

        // Assert
        Assert.Equal(FastId, chosen.LifecycleId);
    }

    [Fact]
    public void ResolveLifecycle_NoExplicitIdOrRequestType_FallsToDefault()
    {
        // Arrange — nothing specified. Act
        var chosen = RequestsService.ResolveLifecycle(Lifecycles(), explicitLifecycleId: null, requestType: null);

        // Assert
        Assert.Equal(StandardId, chosen.LifecycleId);
    }

    [Fact]
    public void ResolveLifecycle_NoDefaultFlagged_FallsToFirst()
    {
        // Arrange — a (degenerate) workspace where no lifecycle is marked default.
        var rows = new[]
        {
            new LifecycleRow { LifecycleId = FastId, Name = "Fast track", RequestType = "Fast track", IsDefault = false, SortOrder = 0 },
            new LifecycleRow { LifecycleId = StandardId, Name = "Standard", RequestType = "Standard", IsDefault = false, SortOrder = 1 },
        };

        // Act
        var chosen = RequestsService.ResolveLifecycle(rows, explicitLifecycleId: null, requestType: null);

        // Assert — the first row is the last-resort fallback.
        Assert.Equal(FastId, chosen.LifecycleId);
    }
}
