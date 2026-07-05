// Integration test for the Gates / Approvals endpoints — full pipeline (api-testing-guidelines.md).
// Verifies each new route is mounted and gated by the fallback authorization policy: a token-less
// request is rejected with 401 before any controller or database access. The authenticated round-trips
// are exercised by the tSQLt proc tests + mocked controller unit tests; a full authenticated cycle
// needs a seeded database and runs at slice-completion (the real-stack validation gate).

using System.Net;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class ApprovalsEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly Guid ApprovalRequestId = new("7A000000-0000-4000-8000-000000000001");
    private const string RecordId = "AI-00000042";

    private readonly WebApplicationFactory<Program> _factory;

    public ApprovalsEndpointsTests(WebApplicationFactory<Program> factory)
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
    public async Task GetApprovalRequests_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/v1/requests/{RecordId}/approval-requests");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task SubmitDecision_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync(
            $"/api/v1/approval-requests/{ApprovalRequestId}/decisions",
            Json("""{ "slotIndex": 0, "decidedByUserId": "00000000-0000-4000-8000-0000000000cc", "decision": "Approved" }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ReRequest_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync(
            $"/api/v1/approval-requests/{ApprovalRequestId}/re-request", Json("""{ "slotIndex": 0 }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ProxyDecision_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync(
            $"/api/v1/approval-requests/{ApprovalRequestId}/proxy-decision",
            Json("""{ "slotIndex": 0, "decidedByUserId": "00000000-0000-4000-8000-0000000000cc", "decision": "Approved", "proxyContext": "Signed off in review" }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
