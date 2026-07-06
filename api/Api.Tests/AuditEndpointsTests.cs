// Integration test for the Audit endpoint — full pipeline (api-testing-guidelines.md). Verifies the
// route is mounted and gated by the fallback authorization policy: a token-less request is rejected
// with 401 before any controller, access check, or database access. The authenticated 403/200 paths
// are exercised by the mocked controller unit tests + tSQLt proc tests; a full authenticated cycle
// needs a seeded database and runs at slice-completion (matching SearchEndpointsTests).

using System.Net;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class AuditEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly Guid WorkspaceId = new("1A150000-0000-4000-8000-000000000001");

    private readonly WebApplicationFactory<Program> _factory;

    public AuditEndpointsTests(WebApplicationFactory<Program> factory)
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
    public async Task QueryWorkspaceAudit_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync(
            $"/api/v1/workspaces/{WorkspaceId}/audit/query",
            Json("""{ "page": 1, "pageSize": 20 }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
