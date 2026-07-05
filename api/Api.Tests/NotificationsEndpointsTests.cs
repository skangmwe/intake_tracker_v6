// Integration test for the Notifications endpoints — verifies each new route is mounted and gated by
// the fallback authorization policy: a token-less request is rejected with 401 before any controller
// or database access (api-testing-guidelines.md). Authenticated round-trips are exercised by the
// tSQLt proc tests + the mocked controller unit tests; a full authenticated cycle needs a seeded
// database and runs at slice-completion.

using System.Net;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class NotificationsEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly Guid NotificationId = new("77777777-7777-4777-8777-777777777777");

    private readonly WebApplicationFactory<Program> _factory;

    public NotificationsEndpointsTests(WebApplicationFactory<Program> factory)
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
    public async Task Query_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var body = new StringContent("""{ "page": 1, "pageSize": 20, "unreadOnly": false }""", Encoding.UTF8, "application/json");
        var response = await client.PostAsync("/api/v1/notifications/query", body);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task UnreadCount_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/v1/notifications/unread-count");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task MarkAllRead_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync("/api/v1/notifications/mark-all-read", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task MarkRead_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync($"/api/v1/notifications/{NotificationId}/mark-read", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
