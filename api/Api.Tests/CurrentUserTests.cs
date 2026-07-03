// Unit tests for CurrentUser — resolving the caller's stable identity from JWT claims.
// Covers v2.0 short claim names, v1.0 long claim-type URIs, unauthenticated requests, and a
// malformed object id (api-client-auth.md — token-claim contract).

using System.Security.Claims;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class CurrentUserTests
{
    private static ICurrentUser Build(ClaimsPrincipal principal)
    {
        var context = new DefaultHttpContext { User = principal };
        var accessor = new HttpContextAccessor { HttpContext = context };
        return new CurrentUser(accessor);
    }

    private static ClaimsPrincipal Authenticated(params Claim[] claims) =>
        new(new ClaimsIdentity(claims, authenticationType: "TestAuth"));

    [Fact]
    public void CurrentUser_V2Claims_ResolvesIdentity()
    {
        // Arrange
        var oid = Guid.NewGuid();
        var sut = Build(Authenticated(
            new Claim("oid", oid.ToString()),
            new Claim("name", "Priya Raman"),
            new Claim("preferred_username", "priya@mws.ai")));

        // Act + Assert
        Assert.True(sut.IsAuthenticated);
        Assert.Equal(oid, sut.UserId);
        Assert.Equal("Priya Raman", sut.DisplayName);
        Assert.Equal("priya@mws.ai", sut.Email);
    }

    [Fact]
    public void CurrentUser_V1ObjectIdClaim_ResolvesUserId()
    {
        // Arrange
        var oid = Guid.NewGuid();
        var sut = Build(Authenticated(
            new Claim("http://schemas.microsoft.com/identity/claims/objectidentifier", oid.ToString())));

        // Act + Assert
        Assert.Equal(oid, sut.TryGetUserId());
    }

    [Fact]
    public void CurrentUser_Unauthenticated_IsNotAuthenticated()
    {
        // Arrange — an identity with no authentication type is not authenticated.
        var sut = Build(new ClaimsPrincipal(new ClaimsIdentity()));

        // Act + Assert
        Assert.False(sut.IsAuthenticated);
        Assert.Null(sut.TryGetUserId());
        Assert.Equal(string.Empty, sut.DisplayName);
        Assert.Throws<InvalidOperationException>(() => sut.UserId);
    }

    [Fact]
    public void CurrentUser_NonGuidObjectId_ReturnsNull()
    {
        // Arrange
        var sut = Build(Authenticated(new Claim("oid", "not-a-guid")));

        // Act + Assert
        Assert.Null(sut.TryGetUserId());
    }
}
