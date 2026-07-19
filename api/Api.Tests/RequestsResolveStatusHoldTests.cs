// Pure-unit tests for RequestsService.ResolveStatusHold (Slice 26).
// Covers the four legal inputs to the tri-state resolver:
//   - explicit StatusHold wins over legacy Hold when both are present,
//   - legacy Hold maps (held=true → OnHold, held=false → InProgress) when StatusHold is absent,
//   - null when neither is present.
// api-testing-guidelines.md: happy + boundary cases; pure helper, no mocks required.

using McDermott.AiTracker.Api.Modules.Requests;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class RequestsResolveStatusHoldTests
{
    [Fact]
    public void ResolveStatusHold_ExplicitOnHold_ReturnsOnHold()
    {
        // Arrange
        var request = new RequestPatchRequest { StatusHold = RequestStatusHoldValue.OnHold };

        // Act
        var resolved = RequestsService.ResolveStatusHold(request);

        // Assert
        Assert.Equal(RequestStatusHoldValue.OnHold, resolved);
    }

    [Fact]
    public void ResolveStatusHold_ExplicitAbandoned_ReturnsAbandoned()
    {
        // Arrange
        var request = new RequestPatchRequest { StatusHold = RequestStatusHoldValue.Abandoned };

        // Act
        var resolved = RequestsService.ResolveStatusHold(request);

        // Assert
        Assert.Equal(RequestStatusHoldValue.Abandoned, resolved);
    }

    [Fact]
    public void ResolveStatusHold_ExplicitInProgress_ReturnsInProgress()
    {
        // Arrange — the reactivation call.
        var request = new RequestPatchRequest { StatusHold = RequestStatusHoldValue.InProgress };

        // Act
        var resolved = RequestsService.ResolveStatusHold(request);

        // Assert
        Assert.Equal(RequestStatusHoldValue.InProgress, resolved);
    }

    [Fact]
    public void ResolveStatusHold_ExplicitWinsOverLegacyHold()
    {
        // Arrange — writers upgrading from the legacy shape may temporarily send both. Explicit wins.
        var request = new RequestPatchRequest
        {
            StatusHold = RequestStatusHoldValue.Abandoned,
            Hold = new HoldInput { Held = true, Reason = "outdated" },
        };

        // Act
        var resolved = RequestsService.ResolveStatusHold(request);

        // Assert
        Assert.Equal(RequestStatusHoldValue.Abandoned, resolved);
    }

    [Fact]
    public void ResolveStatusHold_LegacyHeldTrue_MapsToOnHold()
    {
        // Arrange — pre-v2 client using the binary shape.
        var request = new RequestPatchRequest { Hold = new HoldInput { Held = true, Reason = "Waiting on client" } };

        // Act
        var resolved = RequestsService.ResolveStatusHold(request);

        // Assert
        Assert.Equal(RequestStatusHoldValue.OnHold, resolved);
    }

    [Fact]
    public void ResolveStatusHold_LegacyHeldFalse_MapsToInProgress()
    {
        // Arrange — pre-v2 client clearing hold.
        var request = new RequestPatchRequest { Hold = new HoldInput { Held = false, Reason = null } };

        // Act
        var resolved = RequestsService.ResolveStatusHold(request);

        // Assert
        Assert.Equal(RequestStatusHoldValue.InProgress, resolved);
    }

    [Fact]
    public void ResolveStatusHold_NeitherPresent_ReturnsNull()
    {
        // Arrange — a content-only patch. Status/hold is left untouched.
        var request = new RequestPatchRequest { Name = "New name" };

        // Act
        var resolved = RequestsService.ResolveStatusHold(request);

        // Assert
        Assert.Null(resolved);
    }
}
