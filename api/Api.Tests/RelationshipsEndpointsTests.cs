// Integration test for the Relationships + RecordLinks endpoints (Slice 25) — full
// pipeline (api-testing-guidelines.md). Verifies each route is mounted and gated by the
// fallback authorization policy: a token-less request is rejected with 401 before any
// controller or database access. The authenticated round-trips are exercised by the
// tSQLt Relationships/RecordLinks tests + the controller unit tests.

using System.Net;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class RelationshipsEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly Guid WorkspaceId = new("C0000000-0000-4000-8000-000000000001");
    private static readonly Guid RelationshipId = new("C0000000-0000-4000-8000-000000000002");
    private static readonly Guid LinkId = new("C0000000-0000-4000-8000-000000000003");
    private const string RecordId = "AIS-00000001";

    private readonly WebApplicationFactory<Program> _factory;

    public RelationshipsEndpointsTests(WebApplicationFactory<Program> factory)
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

    // ---------- Relationships routes ----------

    [Fact]
    public async Task ListRelationships_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/v1/workspaces/{WorkspaceId}/relationships");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetRelationship_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync(
            $"/api/v1/relationships/{RelationshipId}?workspaceId={WorkspaceId}");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task CreateRelationship_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync(
            $"/api/v1/workspaces/{WorkspaceId}/relationships",
            Json("{ \"name\": \"Rel\", \"fromObjectType\": \"Request\", \"toObjectType\": \"Task\", \"cardinality\": \"OneToMany\", \"fromSideLabel\": \"Tasks\", \"toSideLabel\": \"Request\" }"));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task PatchRelationship_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Patch,
            $"/api/v1/relationships/{RelationshipId}?workspaceId={WorkspaceId}")
        {
            Content = Json("""{ "name": "Renamed" }"""),
        };
        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task RetireRelationship_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync(
            $"/api/v1/relationships/{RelationshipId}/retire?workspaceId={WorkspaceId}",
            Json("{}"));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task RestoreRelationship_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync(
            $"/api/v1/relationships/{RelationshipId}/restore?workspaceId={WorkspaceId}",
            Json("{}"));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // ---------- Record-links routes ----------

    [Fact]
    public async Task ListRecordLinks_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync(
            $"/api/v1/records/{RecordId}/relationship-links?workspaceId={WorkspaceId}");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task CreateRecordLink_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync(
            $"/api/v1/records/{RecordId}/relationship-links?workspaceId={WorkspaceId}",
            Json($$"""{ "relationshipId": "{{RelationshipId}}", "toRecordId": "AIS-00000002" }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task DeleteRecordLink_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.DeleteAsync(
            $"/api/v1/records/{RecordId}/relationship-links/{LinkId}?workspaceId={WorkspaceId}");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
