// Integration test for the Import/Export endpoints — full pipeline (api-testing-guidelines.md).
// Verifies each route is mounted and gated by the fallback authorization policy: a token-less request
// is rejected with 401 before any controller or database access. Authenticated round-trips (upload →
// poll → export) are exercised by the tSQLt proc tests + mocked controller/service unit tests; a full
// authenticated cycle needs a seeded database and runs at slice-completion (matching SearchEndpoints).

using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class ImportExportEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly Guid WorkspaceId = new("1A150000-0000-4000-8000-000000000001");
    private static readonly Guid ImportId = new("33333333-3333-4333-8333-333333333333");

    private readonly WebApplicationFactory<Program> _factory;

    public ImportExportEndpointsTests(WebApplicationFactory<Program> factory)
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
    public async Task ImportCsv_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        using var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(Encoding.UTF8.GetBytes("Name\nAlpha"));
        file.Headers.ContentType = new MediaTypeHeaderValue("text/csv");
        content.Add(file, "file", "import.csv");

        var response = await client.PostAsync($"/api/v1/workspaces/{WorkspaceId}/imports/csv", content);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetImportStatus_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/v1/imports/{ImportId}");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Export_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync(
            "/api/v1/exports",
            Json($$"""{ "savedViewId": "{{Guid.NewGuid()}}" }"""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    /// <summary>Container-resolution guard: IIoObjectRegistry -> ICustomObjectIoObjectFactory ->
    /// IFieldSchemaService used to close a cycle back onto IIoObjectRegistry (FieldSchemaService only
    /// ever needed the built-in IIoObject descriptors, not the registry itself). Resolving both from a
    /// real scope exercises the full constructor graph and throws
    /// InvalidOperationException("A circular dependency was detected...") if the cycle regresses — no
    /// database access is required, this only constructs the object graph.</summary>
    [Fact]
    public void ServiceProvider_ResolvesIIoObjectRegistryAndIFieldSchemaService_NoCircularDependency()
    {
        using var scope = _factory.Services.CreateScope();

        var registry = scope.ServiceProvider
            .GetRequiredService<McDermott.AiTracker.Api.Modules.ImportExport.IIoObjectRegistry>();
        var fields = scope.ServiceProvider
            .GetRequiredService<McDermott.AiTracker.Api.Modules.Fields.IFieldSchemaService>();

        Assert.NotNull(registry);
        Assert.NotNull(fields);
    }
}
