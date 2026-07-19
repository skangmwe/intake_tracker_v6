// Integration test for the Toolkit endpoints — verifies each route is mounted and gated by the
// fallback authorization policy: a token-less request is rejected with 401 before any controller or
// database access (api-testing-guidelines.md). Authenticated round-trips are exercised by the tSQLt
// proc tests + the mocked controller unit tests; a full authenticated cycle needs a seeded database.

using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class ToolkitEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string WorkspaceId = "11111111-1111-4111-8111-111111111111";
    private const string ItemId = "AIS-00000073";

    private readonly WebApplicationFactory<Program> _factory;

    public ToolkitEndpointsTests(WebApplicationFactory<Program> factory)
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

    private static MultipartFormDataContent MultipartBody(string payloadJson)
    {
        var content = new MultipartFormDataContent();
        content.Add(new StringContent(payloadJson), "payload");
        return content;
    }

    [Fact]
    public async Task Query_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync($"/api/v1/workspaces/{WorkspaceId}/toolkit/query", JsonBody("""{ "page": 1, "pageSize": 20 }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetById_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/v1/toolkit/{ItemId}");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Create_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync($"/api/v1/workspaces/{WorkspaceId}/toolkit", MultipartBody("""{ "kind": "Prompt", "name": "X" }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Patch_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Patch, $"/api/v1/toolkit/{ItemId}")
        {
            Content = MultipartBody("""{ "name": "Y" }"""),
        };
        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Retire_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync($"/api/v1/toolkit/{ItemId}/retire", JsonBody("{}"));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Restore_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync($"/api/v1/toolkit/{ItemId}/restore", JsonBody("{}"));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task DownloadAttachment_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/v1/toolkit/{ItemId}/attachment");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Query_WithBearerButNoValidToken_IsRejected()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "not-a-real-token");
        var response = await client.PostAsync($"/api/v1/workspaces/{WorkspaceId}/toolkit/query", JsonBody("""{ "page": 1, "pageSize": 20 }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
