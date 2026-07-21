// Integration test for the Objects endpoints (Objects tab, S30) — full pipeline
// (api-testing-guidelines.md). Verifies each route is mounted and gated by the fallback
// authorization policy: a token-less request is rejected with 401 before any controller or database
// access. The authenticated round-trips are exercised by the tSQLt object procs + controller unit tests.

using System.Net;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class ObjectsEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly Guid WorkspaceId = new("D0000000-0000-4000-8000-000000000001");
    private static readonly Guid ObjectId = new("D0000000-0000-4000-8000-000000000002");

    private readonly WebApplicationFactory<Program> _factory;

    public ObjectsEndpointsTests(WebApplicationFactory<Program> factory)
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

    private static StringContent Json(string body) => new(body, Encoding.UTF8, "application/json");

    [Fact]
    public async Task ListObjects_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/v1/workspaces/{WorkspaceId}/objects");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task CreateObject_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync(
            $"/api/v1/workspaces/{WorkspaceId}/objects",
            Json("""{ "name": "Vendor", "location": "LocalWorkspace", "showInSidebar": true }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task PatchObject_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Patch,
            $"/api/v1/objects/{ObjectId}?workspaceId={WorkspaceId}")
        {
            Content = Json("""{ "name": "Renamed" }"""),
        };
        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task DeleteObject_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.DeleteAsync($"/api/v1/objects/{ObjectId}?workspaceId={WorkspaceId}");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
