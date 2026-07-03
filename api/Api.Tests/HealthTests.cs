// Scaffold-only smoke test — proves the pipeline wires up and /health returns 200.
// Slice authors add per-controller and per-service tests alongside their code
// per api-testing-guidelines.md.

using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class HealthTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public HealthTests(WebApplicationFactory<Program> factory) => _factory = factory;

    [Fact]
    public async Task Health_returns200_withStatusOk()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<HealthResponse>();
        Assert.NotNull(body);
        Assert.Equal("ok", body!.Status);
        Assert.Equal("ai-solutions-tracker-api", body.Service);
    }

    private sealed record HealthResponse(string Status, string Service, string Version);
}
