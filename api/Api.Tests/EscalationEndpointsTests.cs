// Integration test for the escalation endpoint — verifies it is mounted and gated by the fallback
// authorization policy: a token-less request is rejected with 401 before any controller or database
// access (api-testing-guidelines.md). The authorized escalate → bridge round-trip is exercised by the
// tSQLt EscalationTests plus the mocked controller/service unit tests, and end-to-end against LocalDB
// at slice-completion.

using System.Net;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class EscalationEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string RecordId = "LIT-00000001";

    private readonly WebApplicationFactory<Program> _factory;

    public EscalationEndpointsTests(WebApplicationFactory<Program> factory)
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
    public async Task Escalate_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync(
            $"/api/v1/requests/{RecordId}/escalate",
            new StringContent("""{ "confirmPendingEdits": true }""", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
