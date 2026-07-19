// Integration test for the Watchers endpoints — verifies each new route is mounted and gated by the
// fallback authorization policy: a token-less request is rejected with 401 before any controller or
// database access (api-testing-guidelines.md). Authenticated round-trips are exercised by the tSQLt
// proc tests + the mocked controller unit tests; a full authenticated cycle needs a seeded database
// and runs at slice-completion.

using System.Net;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class WatchersEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string RecordId = "AIS-00000042";
    private static readonly Guid TargetUserId = new("66666666-6666-4666-8666-666666666666");

    private readonly WebApplicationFactory<Program> _factory;

    public WatchersEndpointsTests(WebApplicationFactory<Program> factory)
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
    public async Task GetWatchers_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/v1/records/{RecordId}/watchers");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task AddWatcher_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var body = new StringContent("{}", Encoding.UTF8, "application/json");
        var response = await client.PostAsync($"/api/v1/records/{RecordId}/watchers", body);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task RemoveWatcher_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.DeleteAsync($"/api/v1/records/{RecordId}/watchers/{TargetUserId}");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task PatchMyWatch_WithoutToken_Returns401()
    {
        // Slice 26 — PATCH /records/{recordId}/watchers/me must be gated by the fallback auth policy.
        var client = _factory.CreateClient();
        var body = new StringContent("{\"notifyGateDecisions\":false}", Encoding.UTF8, "application/json");
        var response = await client.PatchAsync($"/api/v1/records/{RecordId}/watchers/me", body);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
