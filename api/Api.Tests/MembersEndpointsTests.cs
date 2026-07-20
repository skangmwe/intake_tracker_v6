// Integration test for the S29 Users & access members endpoints — verifies they are mounted and
// gated by the fallback authorization policy: a token-less request is rejected with 401 before any
// controller or database access (api-testing-guidelines.md). The authorized happy path is exercised
// by the tSQLt proc tests plus the mocked controller unit tests; a full authenticated round-trip
// needs a seeded database and runs at slice-completion against LocalDB.

using System.Net;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class MembersEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly Guid WorkspaceId = new("1A150000-0000-4000-8000-000000000001");
    private static readonly Guid TargetUserId = new("00000000-0000-4000-8000-0000000000AA");
    private static readonly Guid InvitationId = new("00000000-0000-4000-8000-0000000000F1");

    private readonly WebApplicationFactory<Program> _factory;

    public MembersEndpointsTests(WebApplicationFactory<Program> factory)
    {
        // Pin a non-Development environment so real JWT-bearer auth applies (dev bypass is
        // Development-only) and a token-less request is rejected with 401 by the fallback policy.
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Production");
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Auth:DevBypass:Enabled"] = "false",
                    ["AzureAd:Instance"] = "https://login.microsoftonline.com/",
                    ["AzureAd:TenantId"] = "11111111-1111-1111-1111-111111111111",
                    ["AzureAd:ClientId"] = "22222222-2222-2222-2222-222222222222",
                    ["AzureAd:Audience"] = "api://22222222-2222-2222-2222-222222222222",
                });
            });
        });
    }

    private static StringContent Json(string body) => new(body, Encoding.UTF8, "application/json");

    [Fact]
    public async Task ListMembers_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/v1/workspaces/{WorkspaceId}/members");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task UpsertMember_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync(
            $"/api/v1/workspaces/{WorkspaceId}/members",
            Json("""{ "email": "priya@example.com", "level": "Member" }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task DeactivateMember_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.DeleteAsync($"/api/v1/workspaces/{WorkspaceId}/members/{TargetUserId}");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task CancelInvitation_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.DeleteAsync($"/api/v1/workspaces/{WorkspaceId}/invitations/{InvitationId}");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task SetSuspension_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync(
            $"/api/v1/workspaces/{WorkspaceId}/members/{TargetUserId}/suspension",
            Json("""{ "suspended": true }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
