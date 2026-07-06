// Integration test for the Home endpoint — full pipeline (api-testing-guidelines.md). Verifies the
// route is mounted and gated by the fallback authorization policy: a token-less request is rejected with
// 401 before any controller, access check, or database access. The authenticated 400/403/200 paths are
// exercised by the mocked controller unit tests + the tSQLt proc tests; a full authenticated cycle needs
// a seeded database and runs at slice-completion (matching SearchEndpointsTests / AuditEndpointsTests).

using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class HomeEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly Guid WorkspaceId = new("1A150000-0000-4000-8000-000000000001");

    private readonly WebApplicationFactory<Program> _factory;

    public HomeEndpointsTests(WebApplicationFactory<Program> factory)
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

    [Fact]
    public async Task GetHome_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/v1/home?workspaceId={WorkspaceId}");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
