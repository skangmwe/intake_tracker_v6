// Unit tests for AttachmentIoObject (field-surfacing sweep) — the export-only Attachment descriptor.
// Verifies the manifest drives export fields (identity, no import), the catalog fields mirror the same
// manifest, BuildExportAsync projects the workspace attachment query (kind = file/link, uploader name),
// pages past a full batch, trims at the row cap, and propagates cancellation. IAttachmentsService is
// mocked — the descriptor has no DbContext, so every branch is unit-testable.

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Attachments;
using McDermott.AiTracker.Api.Modules.ImportExport;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class AttachmentIoObjectTests
{
    private static readonly Guid WorkspaceId = new("1A150000-0000-4000-8000-000000000001");
    private static readonly Guid ActorId = Guid.NewGuid();

    private readonly Mock<IAttachmentsService> _attachments = new();

    private AttachmentIoObject Build(ImportExportOptions? options = null) =>
        new(_attachments.Object, Options.Create(options ?? new ImportExportOptions()));

    private static WorkspaceAttachmentExportRow Row(string fileName, bool isLink, string? uploadedBy) =>
        new()
        {
            AttachmentId = Guid.NewGuid(),
            RecordId = "LIT-9004",
            ObjectType = "Request",
            FileName = fileName,
            ContentType = isLink ? "text/uri-list" : "application/pdf",
            SizeBytes = isLink ? 0 : 2048,
            IsLink = isLink,
            ExternalUrl = isLink ? "https://example.com/doc" : null,
            CreatedAt = new DateTime(2026, 7, 1, 12, 0, 0, DateTimeKind.Utc),
            UploadedByName = uploadedBy,
        };

    private void SetupPage(int page, IReadOnlyList<WorkspaceAttachmentExportRow> rows) =>
        _attachments
            .Setup(service => service.QueryWorkspaceAttachmentsAsync(WorkspaceId, page, It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(rows);

    [Fact]
    public async Task Metadata_IsExportOnly_WithIdentityAndCatalogMirroringManifest()
    {
        var sut = Build();
        var exportFields = await sut.GetExportFieldsAsync(WorkspaceId, ActorId, CancellationToken.None);

        Assert.Equal("Attachment", sut.ObjectType);
        Assert.False(sut.CanImport);
        Assert.True(sut.CanExport);
        Assert.Empty(sut.ImportFields);
        Assert.Contains(exportFields, field => field.Key == "fileName" && field.AlwaysIncluded);
        // The catalog fields are the same manifest keys the export exposes (single source, no drift).
        var exportKeys = exportFields.Select(field => field.Key).OrderBy(key => key);
        var catalogKeys = sut.CatalogFields.Select(field => field.Key).OrderBy(key => key);
        Assert.Equal(exportKeys, catalogKeys);
        Assert.All(sut.CatalogFields, field => Assert.Equal("Attachment", field.ObjectType));
    }

    [Fact]
    public async Task BuildExportAsync_ProjectsRows_ResolvingKindAndUploader()
    {
        SetupPage(1, new[]
        {
            Row("brief.pdf", isLink: false, uploadedBy: "Alex Chen"),
            Row("reference.html", isLink: true, uploadedBy: null),
        });

        var dataset = await Build().BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        Assert.NotNull(dataset);
        Assert.Equal(2, dataset!.Rows.Count);
        Assert.Equal("brief.pdf", dataset.Rows[0]["fileName"]);
        Assert.Equal("Request", dataset.Rows[0]["parentType"]);
        Assert.Equal("File", dataset.Rows[0]["kind"]);
        Assert.Equal("Alex Chen", dataset.Rows[0]["uploadedBy"]);
        Assert.Equal("Link", dataset.Rows[1]["kind"]);
        Assert.Null(dataset.Rows[1]["uploadedBy"]);
    }

    [Fact]
    public async Task BuildExportAsync_NeverReturnsNull_ForWorkspaceScopedObject()
    {
        SetupPage(1, Array.Empty<WorkspaceAttachmentExportRow>());

        var dataset = await Build().BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        Assert.NotNull(dataset);
        Assert.Empty(dataset!.Rows);
    }

    [Fact]
    public async Task BuildExportAsync_PagesPastAFullBatch()
    {
        var fullPage = Enumerable.Range(0, 100).Select(index => Row($"file{index}.pdf", false, null)).ToList();
        SetupPage(1, fullPage);
        SetupPage(2, new[] { Row("last.pdf", false, null) });

        var dataset = await Build().BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        Assert.NotNull(dataset);
        Assert.Equal(101, dataset!.Rows.Count);
        _attachments.Verify(
            service => service.QueryWorkspaceAttachmentsAsync(WorkspaceId, 2, It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task BuildExportAsync_StopsAtRowCap()
    {
        var options = new ImportExportOptions { MaxExportRows = 1 };
        SetupPage(1, new[] { Row("a.pdf", false, null), Row("b.pdf", false, null) });

        var dataset = await Build(options).BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        Assert.NotNull(dataset);
        Assert.Single(dataset!.Rows);
    }

    [Fact]
    public async Task BuildExportAsync_CancellationPropagates()
    {
        _attachments
            .Setup(service => service.QueryWorkspaceAttachmentsAsync(
                WorkspaceId, It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAsync<OperationCanceledException>(
            () => Build().BuildExportAsync(WorkspaceId, ActorId, cts.Token));
    }
}
