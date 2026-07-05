// Integration test for the Closure endpoint (Slice 10) — full pipeline (api-testing-guidelines.md).
// Verifies the route is mounted and gated by the fallback authorization policy: a token-less request
// is rejected with 401 before any controller or database access. The authenticated round-trip is
// exercised by the tSQLt usp_CloseRequest tests + the mocked ClosureService unit tests.

using System.Net;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class ClosureEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string RecordId = "AI-00000042";

    private readonly WebApplicationFactory<Program> _factory;

    public ClosureEndpointsTests(WebApplicationFactory<Program> factory)
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
    public async Task CloseRequest_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync(
            $"/api/v1/requests/{RecordId}/close",
            Json("""{ "outcome": { "kind": "delivery", "value": "Live", "notes": "" } }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
