// Integration test for the TypedLinks + Copy endpoints (Slice 10) — full pipeline
// (api-testing-guidelines.md). Verifies each route is mounted and gated by the fallback authorization
// policy: a token-less request is rejected with 401 before any controller or database access. The
// authenticated round-trips are exercised by the tSQLt link-proc tests + the mocked service unit tests.

using System.Net;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class TypedLinksEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly Guid WorkspaceId = new("1A150000-0000-4000-8000-000000000001");
    private static readonly Guid LinkId = new("66666666-6666-4666-8666-666666666666");
    private const string RecordId = "AI-00000042";

    private readonly WebApplicationFactory<Program> _factory;

    public TypedLinksEndpointsTests(WebApplicationFactory<Program> factory)
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
    public async Task GetLinks_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/v1/records/{RecordId}/links");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task AddLink_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync(
            $"/api/v1/records/{RecordId}/links",
            Json("""{ "toRecordId": "AI-00000043", "kind": "related" }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task DeleteLink_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.DeleteAsync($"/api/v1/links/{LinkId}");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Copy_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync(
            $"/api/v1/records/{RecordId}/copy",
            Json($$"""{ "targetWorkspaceId": "{{WorkspaceId}}", "includeAttachments": false }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
