// Integration test for the custom-object record endpoints (Slice 1b) — full pipeline
// (api-testing-guidelines.md), mirroring ObjectsEndpointsTests. Verifies each of the five routes is
// mounted and gated by the fallback authorization policy: a token-less request is rejected with 401
// before any controller or database access. The authenticated CRUD round-trip is exercised by the
// tSQLt record procs + the service/controller unit tests, and smoke-verified against LocalDB.

using System.Net;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class CustomRecordsEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly Guid WorkspaceId = new("D1000000-0000-4000-8000-000000000001");
    private static readonly Guid ObjectId = new("D1000000-0000-4000-8000-000000000002");
    private static readonly Guid RecordId = new("D1000000-0000-4000-8000-000000000003");

    private readonly WebApplicationFactory<Program> _factory;

    public CustomRecordsEndpointsTests(WebApplicationFactory<Program> factory)
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

    private string RecordsBase => $"/api/v1/workspaces/{WorkspaceId}/objects/{ObjectId}/records";

    private static StringContent Json(string body) => new(body, Encoding.UTF8, "application/json");

    [Fact]
    public async Task CreateRecord_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync(RecordsBase, Json("""{ "name": "Acme", "fields": {} }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task QueryRecords_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync($"{RecordsBase}/query", Json("""{ "page": 1, "pageSize": 20 }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetRecord_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"{RecordsBase}/{RecordId}");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task PatchRecord_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Patch, $"{RecordsBase}/{RecordId}")
        {
            Content = Json("""{ "name": "Renamed", "fields": {} }"""),
        };
        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task DeleteRecord_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.DeleteAsync($"{RecordsBase}/{RecordId}");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
