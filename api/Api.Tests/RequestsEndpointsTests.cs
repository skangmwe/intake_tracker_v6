// Integration test for the Requests & Drafts endpoints — full request/response cycle through the
// real middleware pipeline (api-testing-guidelines.md). Verifies the endpoints are mounted and gated
// by the fallback authorization policy: a token-less request is rejected with 401 before any
// controller or database access. The authorized happy path is exercised by the tSQLt proc tests plus
// the mocked controller unit tests; a full authenticated round-trip needs a seeded database and runs
// at slice-completion against LocalDB.

using System.Net;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class RequestsEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly Guid WorkspaceId = new("1A150000-0000-4000-8000-000000000001");
    private const string RecordId = "AI-00000042";

    private readonly WebApplicationFactory<Program> _factory;

    public RequestsEndpointsTests(WebApplicationFactory<Program> factory)
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
    public async Task CreateRequest_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync(
            $"/api/v1/workspaces/{WorkspaceId}/requests",
            Json("""{ "name": "Doc extraction", "description": "", "fields": {} }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task QueryRequests_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync(
            $"/api/v1/workspaces/{WorkspaceId}/requests/query",
            Json("""{ "page": 1, "pageSize": 20 }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetRequest_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/v1/requests/{RecordId}");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task MoveStage_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync($"/api/v1/requests/{RecordId}/stage", Json("""{ "toStage": "build" }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ListDrafts_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/v1/workspaces/{WorkspaceId}/drafts");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
