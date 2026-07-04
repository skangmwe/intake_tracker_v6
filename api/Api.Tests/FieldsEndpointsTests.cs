// Integration test for the Fields & objects and Platform field endpoints — full request/response
// cycle through the real middleware pipeline (api-testing-guidelines.md). Verifies the endpoints
// are mounted and gated by the fallback authorization policy: a token-less request is rejected with
// 401 before any controller or database access. The authorized happy path is exercised by the
// tSQLt proc tests plus the mocked controller unit tests; a full authenticated round-trip needs a
// seeded database and is run at slice-completion against LocalDB.

using System.Net;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class FieldsEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly Guid WorkspaceId = new("1A150000-0000-4000-8000-000000000001");

    private readonly WebApplicationFactory<Program> _factory;

    public FieldsEndpointsTests(WebApplicationFactory<Program> factory)
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

    [Fact]
    public async Task GetFields_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/v1/workspaces/{WorkspaceId}/fields?objectType=Request");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task CreateField_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var body = new StringContent(
            "{\"objectType\":\"Request\",\"fieldKey\":\"severity\",\"displayName\":\"Severity\",\"fieldType\":\"SingleSelect\",\"category\":\"WorkspaceLocal\"}",
            Encoding.UTF8, "application/json");
        var response = await client.PostAsync($"/api/v1/workspaces/{WorkspaceId}/fields", body);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetTaskFields_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/v1/workspaces/{WorkspaceId}/task-fields");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetPlatformFields_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/v1/platform/fields");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
