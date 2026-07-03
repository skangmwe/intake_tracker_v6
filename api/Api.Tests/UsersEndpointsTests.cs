// Integration test for the identity endpoints — full request/response cycle through the real
// middleware pipeline (api-testing-guidelines.md). The default test host runs without the dev
// bypass (that is Development-only), so real Entra validation applies: an unauthenticated call
// to a protected endpoint is rejected by the fallback authorization policy with 401, while the
// anonymous /health endpoint stays reachable. Neither path touches the database.

using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class UsersEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public UsersEndpointsTests(WebApplicationFactory<Program> factory)
    {
        // Well-formed (fake) Entra config so real JWT-bearer auth is wired deterministically —
        // dev bypass OFF. A token-less request is rejected before any Entra metadata is fetched.
        _factory = factory.WithWebHostBuilder(builder =>
        {
            // WebApplicationFactory defaults to the Development environment, which loads
            // appsettings.Development.json and turns the dev bypass ON. Pin a non-Development
            // environment so real JWT-bearer auth applies (dev bypass is Development-only) and
            // a token-less request is rejected with 401 by the fallback policy.
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
    public async Task GetMe_WithoutToken_Returns401()
    {
        // Arrange
        var client = _factory.CreateClient();

        // Act
        var response = await client.GetAsync("/api/v1/users/me");

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task UpdateTheme_WithoutToken_Returns401()
    {
        // Arrange
        var client = _factory.CreateClient();

        // Act
        var response = await client.PostAsync(
            "/api/v1/users/me/theme",
            new StringContent("{\"theme\":\"dark\"}", System.Text.Encoding.UTF8, "application/json"));

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Health_StaysAnonymous_Returns200()
    {
        // Arrange
        var client = _factory.CreateClient();

        // Act
        var response = await client.GetAsync("/health");

        // Assert — the fallback auth policy does not lock out the anonymous health probe.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
