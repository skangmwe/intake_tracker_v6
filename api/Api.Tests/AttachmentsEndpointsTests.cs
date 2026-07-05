// Integration test for the Attachments endpoints — full pipeline (api-testing-guidelines.md).
// Verifies each new route is mounted and gated by the fallback authorization policy: a token-less
// request is rejected with 401 before any controller or database access. Authenticated round-trips
// are exercised by the tSQLt proc tests + mocked controller unit tests; a full authenticated cycle
// needs a seeded database and runs at slice-completion.

using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class AttachmentsEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string RecordId = "AIS-00000042";
    private static readonly Guid AttachmentId = new("55555555-5555-4555-8555-555555555555");

    private readonly WebApplicationFactory<Program> _factory;

    public AttachmentsEndpointsTests(WebApplicationFactory<Program> factory)
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
    public async Task ListAttachments_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/v1/records/{RecordId}/attachments");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task UploadAttachment_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        using var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(new byte[] { 1, 2, 3 });
        file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        content.Add(file, "file", "brief.pdf");

        var response = await client.PostAsync($"/api/v1/records/{RecordId}/attachments", content);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task LinkAttachment_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var body = new StringContent("""{ "url": "https://x", "title": "Spec" }""", Encoding.UTF8, "application/json");
        var response = await client.PostAsync($"/api/v1/records/{RecordId}/attachments/link", body);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task DownloadAttachment_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/v1/attachments/{AttachmentId}/content");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task DeleteAttachment_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.DeleteAsync($"/api/v1/attachments/{AttachmentId}");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
