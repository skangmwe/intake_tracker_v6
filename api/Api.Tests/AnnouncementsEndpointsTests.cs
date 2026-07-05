// Integration test for the Announcements endpoints — verifies each route is mounted and gated by the
// fallback authorization policy: a token-less request is rejected with 401 before any controller or
// database access (api-testing-guidelines.md). Authenticated round-trips are exercised by the tSQLt
// proc tests + the mocked controller unit tests; a full authenticated cycle needs a seeded database.

using System.Net;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class AnnouncementsEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly Guid WorkspaceId = new("1a150000-0000-4000-8000-000000000001");
    private static readonly Guid AnnouncementId = new("0a000000-0000-4000-8000-0000000000f1");

    private readonly WebApplicationFactory<Program> _factory;

    public AnnouncementsEndpointsTests(WebApplicationFactory<Program> factory)
    {
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

    private static StringContent JsonBody(string json) => new(json, Encoding.UTF8, "application/json");

    [Fact]
    public async Task Query_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync("/api/v1/announcements/query", JsonBody("""{ "page": 1, "pageSize": 20 }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetById_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/v1/announcements/{AnnouncementId}");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Create_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var body = JsonBody("""{ "title": "T", "body": "B", "audience": { "kind": "everyone" } }""");
        var response = await client.PostAsync($"/api/v1/workspaces/{WorkspaceId}/announcements", body);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ManageQuery_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync($"/api/v1/workspaces/{WorkspaceId}/announcements/query", JsonBody("""{ "page": 1, "pageSize": 20 }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Publish_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync($"/api/v1/announcements/{AnnouncementId}/publish", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Retire_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync($"/api/v1/announcements/{AnnouncementId}/retire", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
