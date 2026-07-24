// Unit tests for ToolkitIoObject (field-surfacing sweep) — the export-only Toolkit item descriptor.
// Verifies the manifest drives export fields (identity, no import), the catalog fields mirror the same
// manifest, BuildExportAsync projects the workspace toolkit query (all user-meaningful columns), pages
// past a full batch, trims at the row cap, and propagates cancellation. IToolkitService is mocked.

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.ImportExport;
using McDermott.AiTracker.Api.Modules.Toolkit;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class ToolkitIoObjectTests
{
    private static readonly Guid WorkspaceId = new("1A150000-0000-4000-8000-000000000001");
    private static readonly Guid ActorId = Guid.NewGuid();

    private readonly Mock<IToolkitService> _toolkit = new();

    private ToolkitIoObject Build(ImportExportOptions? options = null) =>
        new(_toolkit.Object, Options.Create(options ?? new ImportExportOptions()));

    private static WorkspaceToolkitExportRow Row(string name, string kind, bool hasAttachment, string? updatedBy) =>
        new()
        {
            RecordId = "TK-0001",
            Kind = kind,
            Status = "Active",
            Name = name,
            OneLiner = "A handy thing",
            Description = "Longer description",
            Maintainer = "Team AI",
            HowTo = "Run it",
            BodyMarkdown = "# Body",
            AttachmentFileName = hasAttachment ? "guide.pdf" : null,
            HasAttachment = hasAttachment,
            UpdatedAt = new DateTime(2026, 7, 2, 9, 0, 0, DateTimeKind.Utc),
            UpdatedByName = updatedBy,
        };

    private void SetupPage(int page, IReadOnlyList<WorkspaceToolkitExportRow> rows) =>
        _toolkit
            .Setup(service => service.QueryWorkspaceToolkitAsync(WorkspaceId, page, It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(rows);

    [Fact]
    public void Metadata_IsExportOnly_WithIdentityAndCatalogMirroringManifest()
    {
        var sut = Build();

        Assert.Equal("ToolkitItem", sut.ObjectType);
        Assert.False(sut.CanImport);
        Assert.True(sut.CanExport);
        Assert.Empty(sut.ImportFields);
        Assert.Contains(sut.ExportFields, field => field.Key == "name" && field.AlwaysIncluded);
        Assert.Contains(sut.ExportFields, field => field.Key == "body");
        var exportKeys = sut.ExportFields.Select(field => field.Key).OrderBy(key => key);
        var catalogKeys = sut.CatalogFields.Select(field => field.Key).OrderBy(key => key);
        Assert.Equal(exportKeys, catalogKeys);
        Assert.All(sut.CatalogFields, field => Assert.Equal("ToolkitItem", field.ObjectType));
    }

    [Fact]
    public async Task BuildExportAsync_ProjectsAllUserMeaningfulColumns()
    {
        SetupPage(1, new[] { Row("Clause finder", "Prompt", hasAttachment: true, updatedBy: "Sam Ruiz") });

        var dataset = await Build().BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        Assert.NotNull(dataset);
        var row = Assert.Single(dataset!.Rows);
        Assert.Equal("Clause finder", row["name"]);
        Assert.Equal("Prompt", row["kind"]);
        Assert.Equal("Longer description", row["description"]);
        Assert.Equal("# Body", row["body"]);
        Assert.Equal(true, row["hasAttachment"]);
        Assert.Equal("guide.pdf", row["attachmentFileName"]);
        Assert.Equal("Sam Ruiz", row["updatedBy"]);
    }

    [Fact]
    public async Task BuildExportAsync_NeverReturnsNull_ForWorkspaceScopedObject()
    {
        SetupPage(1, Array.Empty<WorkspaceToolkitExportRow>());

        var dataset = await Build().BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        Assert.NotNull(dataset);
        Assert.Empty(dataset!.Rows);
    }

    [Fact]
    public async Task BuildExportAsync_PagesPastAFullBatch()
    {
        var fullPage = Enumerable.Range(0, 100).Select(index => Row($"Item {index}", "Playbook", false, null)).ToList();
        SetupPage(1, fullPage);
        SetupPage(2, new[] { Row("Last", "Playbook", false, null) });

        var dataset = await Build().BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        Assert.NotNull(dataset);
        Assert.Equal(101, dataset!.Rows.Count);
        _toolkit.Verify(
            service => service.QueryWorkspaceToolkitAsync(WorkspaceId, 2, It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task BuildExportAsync_StopsAtRowCap()
    {
        var options = new ImportExportOptions { MaxExportRows = 1 };
        SetupPage(1, new[] { Row("A", "Prompt", false, null), Row("B", "Prompt", false, null) });

        var dataset = await Build(options).BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        Assert.NotNull(dataset);
        Assert.Single(dataset!.Rows);
    }

    [Fact]
    public async Task BuildExportAsync_CancellationPropagates()
    {
        _toolkit
            .Setup(service => service.QueryWorkspaceToolkitAsync(
                WorkspaceId, It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAsync<OperationCanceledException>(
            () => Build().BuildExportAsync(WorkspaceId, ActorId, cts.Token));
    }
}
