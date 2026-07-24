// Integration test for the trigger admin endpoints (slice: triggers-request-authoring) — verifies each of
// the five routes is mounted and gated by the fallback authorization policy: a token-less request is
// rejected with 401 before any controller or database access. The authenticated CRUD round-trip is
// exercised by the tSQLt CRUD procs + the service/controller unit tests, and smoke-verified against LocalDB.

using System.Net;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class TriggersEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly Guid WorkspaceId = new("E1000000-0000-4000-8000-000000000001");
    private static readonly Guid TriggerId = new("E1000000-0000-4000-8000-000000000002");

    private readonly WebApplicationFactory<Program> _factory;

    public TriggersEndpointsTests(WebApplicationFactory<Program> factory)
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

    private string TriggersBase => $"/api/v1/workspaces/{WorkspaceId}/triggers";

    private static StringContent Json(string body) => new(body, Encoding.UTF8, "application/json");

    [Fact]
    public async Task ListTriggers_WithoutToken_Returns401()
    {
        var response = await _factory.CreateClient().GetAsync(TriggersBase);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetTrigger_WithoutToken_Returns401()
    {
        var response = await _factory.CreateClient().GetAsync($"{TriggersBase}/{TriggerId}");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task CreateTrigger_WithoutToken_Returns401()
    {
        var response = await _factory.CreateClient().PostAsync(TriggersBase, Json("""{ "name": "Overdue" }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task UpdateTrigger_WithoutToken_Returns401()
    {
        var response = await _factory.CreateClient().PutAsync($"{TriggersBase}/{TriggerId}", Json("""{ "name": "Overdue" }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task DeleteTrigger_WithoutToken_Returns401()
    {
        var response = await _factory.CreateClient().DeleteAsync($"{TriggersBase}/{TriggerId}");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
