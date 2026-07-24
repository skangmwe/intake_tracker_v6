// Unit tests for FeatureIoObject (S28 wizards; dynamic export — field-surfacing sweep slice 3b) — the
// Feature registry descriptor. Verifies the import field specs, that the export columns are derived from
// the hub's Feature field catalog (identity "id" + the catalog fields), that BuildExportAsync projects
// each feature's FieldValues JSON map into an export row (null when the caller is not a hub member →
// 403), and that ImportRowAsync guards the required Name/Type before creating and maps the create
// outcome to a landed/flagged result. IFeaturesService is mocked — the descriptor has no DbContext, so
// every branch is unit-testable.

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Features;
using McDermott.AiTracker.Api.Modules.ImportExport;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class FeatureIoObjectTests
{
    private static readonly Guid WorkspaceId = new("1A150000-0000-4000-8000-000000000001");
    private static readonly Guid ActorId = Guid.NewGuid();

    private readonly Mock<IFeaturesService> _features = new();

    private FeatureIoObject Build(ImportExportOptions? options = null) =>
        new(_features.Object, Options.Create(options ?? new ImportExportOptions()));

    private static ImportRowContext Context() =>
        new(WorkspaceId, ActorId, "admin@firm.example", "op-1");

    private void SetupColumns(params (string Key, string Label)[] fields) =>
        _features
            .Setup(service => service.GetFeatureExportFieldsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(fields.Select(field => new FeatureExportField(field.Key, field.Label)).ToList());

    private void SetupExportPage(int page, IReadOnlyList<WorkspaceFeatureExportRow>? rows) =>
        _features
            .Setup(service => service.QueryFeatureExportAsync(ActorId, page, It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(rows);

    private static WorkspaceFeatureExportRow ExportRow(string recordId, string fieldValuesJson) =>
        new() { RecordId = recordId, FieldValues = fieldValuesJson };

    private static FeatureDto CreatedFeature(string id) =>
        new(
            Id: id, WorkspaceId: WorkspaceId, CreatedAt: DateTime.UtcNow, UpdatedAt: DateTime.UtcNow,
            CreatedBy: "seed", UpdatedBy: "seed", Name: "Imported", OneLiner: string.Empty, WhatItDoes: string.Empty,
            FeatureType: "Functional", CapabilityTags: System.Array.Empty<string>(),
            SolutionPattern: System.Array.Empty<string>(), TechStack: System.Array.Empty<string>(),
            HowToReuse: string.Empty, DemoUrl: null, RepoUrl: null, Owner: string.Empty, Maturity: "Draft",
            DataClassification: null, ComplianceFlags: System.Array.Empty<string>(),
            SourcedFromRecordIds: System.Array.Empty<string>(), ETag: "AAAAAAAAAGQ=");

    [Fact]
    public async Task Metadata_IsImportableAndExportable_WithIdentityAndDynamicCatalogColumns()
    {
        // Arrange — the hub catalog surfaces two Feature fields; the export adds the identity.
        SetupColumns(("name", "Name"), ("featureType", "Type"));
        var sut = Build();

        // Act
        var exportFields = await sut.GetExportFieldsAsync(WorkspaceId, ActorId, CancellationToken.None);

        // Assert
        Assert.Equal("Feature", sut.ObjectType);
        Assert.True(sut.CanImport);
        Assert.True(sut.CanExport);
        // Identity "id" leads and is always included; the hub catalog fields follow.
        Assert.Contains(exportFields, field => field.Key == "id" && field.AlwaysIncluded);
        Assert.Contains(exportFields, field => field.Key == "name");
        Assert.Contains(exportFields, field => field.Key == "featureType");
        Assert.Contains(sut.ImportFields, field => field.Key == "name" && field.Required);
        Assert.Contains(sut.ImportFields, field => field.Key == "featureType" && field.Required);
    }

    [Fact]
    public async Task BuildExportAsync_ProjectsFieldValuesByKey_WithIdentityAndJoinedMultiValue()
    {
        // Arrange — three catalog columns and one feature whose FieldValues carries them.
        SetupColumns(("name", "Name"), ("featureType", "Type"), ("capabilityTags", "Capability Tags"));
        SetupExportPage(1, new[]
        {
            ExportRow("AIS-9001", "{\"name\":\"Alpha\",\"featureType\":\"Functional\",\"capabilityTags\":[\"OCR\",\"Extraction\"]}"),
        });

        // Act
        var dataset = await Build().BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        // Assert — columns come from the catalog (identity + fields); values from the JSON map.
        Assert.NotNull(dataset);
        Assert.Contains(dataset!.Columns, column => column.Key == "id" && column.AlwaysIncluded);
        var row = Assert.Single(dataset.Rows);
        Assert.Equal("AIS-9001", row["id"]);                     // identity from RecordId
        Assert.Equal("Alpha", row["name"]);                      // string
        Assert.Equal("OCR; Extraction", row["capabilityTags"]);  // array → joined
    }

    [Fact]
    public async Task BuildExportAsync_NotHubMember_ReturnsNull()
    {
        // Arrange — the catalog resolves (labels are non-sensitive), but the hub-gated bulk read returns
        // null when the caller is not an AI-hub member.
        SetupColumns(("name", "Name"));
        SetupExportPage(1, null);

        // Act
        var dataset = await Build().BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        // Assert — a null dataset maps to 403 at the service, never a silent empty file.
        Assert.Null(dataset);
    }

    [Fact]
    public async Task BuildExportAsync_StopsAtRowCap()
    {
        // Arrange — a small export cap; the query returns more, but the descriptor trims.
        var options = new ImportExportOptions { MaxExportRows = 1 };
        SetupColumns(("name", "Name"));
        SetupExportPage(1, new[]
        {
            ExportRow("AIS-9001", "{\"name\":\"Alpha\"}"),
            ExportRow("AIS-9002", "{\"name\":\"Beta\"}"),
        });

        // Act
        var dataset = await Build(options).BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        // Assert
        Assert.NotNull(dataset);
        Assert.Single(dataset!.Rows);
    }

    [Fact]
    public async Task BuildExportAsync_PagesPastAFullBatch()
    {
        // Arrange — a full first page (100) forces a second fetch; page 2 holds the last row.
        SetupColumns(("name", "Name"));
        var fullPage = Enumerable.Range(0, 100)
            .Select(index => ExportRow($"AIS-{index:D8}", "{\"name\":\"X\"}"))
            .ToArray();
        SetupExportPage(1, fullPage);
        SetupExportPage(2, new[] { ExportRow("AIS-99999999", "{\"name\":\"Last\"}") });

        // Act
        var dataset = await Build().BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        // Assert — both pages collected, and the second page was actually requested.
        Assert.NotNull(dataset);
        Assert.Equal(101, dataset!.Rows.Count);
        _features.Verify(
            service => service.QueryFeatureExportAsync(ActorId, 2, It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task BuildExportAsync_CancellationPropagates()
    {
        _features
            .Setup(service => service.GetFeatureExportFieldsAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAsync<OperationCanceledException>(() => Build().BuildExportAsync(WorkspaceId, ActorId, cts.Token));
    }

    [Fact]
    public async Task ImportRowAsync_Success_Lands()
    {
        // Arrange — name + type present; create succeeds.
        _features
            .Setup(service => service.CreateAsync(
                It.IsAny<FeatureCreateRequest>(), ActorId, "op-1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FeatureWriteResult(FeatureWriteOutcome.Success, CreatedFeature("FEAT-00000009")));
        var fieldValues = new Dictionary<string, string?> { ["name"] = "Clause finder", ["featureType"] = "Functional" };

        // Act
        var result = await Build().ImportRowAsync(Context(), fieldValues, CancellationToken.None);

        // Assert
        Assert.Equal(ImportRowResult.Landed, result.Outcome);
        Assert.Equal("FEAT-00000009", result.RecordId);
        Assert.Empty(result.Reasons);
    }

    [Fact]
    public async Task ImportRowAsync_MissingRequired_FlagsWithoutCreating()
    {
        // Arrange — name present but type blank; the required guard flags before any create.
        var fieldValues = new Dictionary<string, string?> { ["name"] = "No type", ["featureType"] = "   " };

        // Act
        var result = await Build().ImportRowAsync(Context(), fieldValues, CancellationToken.None);

        // Assert — flagged with a missing-required reason; create never called.
        Assert.Equal(ImportRowResult.Flagged, result.Outcome);
        Assert.Null(result.RecordId);
        Assert.Contains(result.Reasons, reason => reason.Field == "featureType");
        _features.Verify(
            service => service.CreateAsync(
                It.IsAny<FeatureCreateRequest>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task ImportRowAsync_DeniedOutcome_FlagsGeneric()
    {
        // Arrange — create denies (caller is not a hub member).
        _features
            .Setup(service => service.CreateAsync(
                It.IsAny<FeatureCreateRequest>(), ActorId, "op-1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FeatureWriteResult(FeatureWriteOutcome.Denied));
        var fieldValues = new Dictionary<string, string?> { ["name"] = "Blocked", ["featureType"] = "Functional" };

        // Act
        var result = await Build().ImportRowAsync(Context(), fieldValues, CancellationToken.None);

        // Assert
        Assert.Equal(ImportRowResult.Flagged, result.Outcome);
        Assert.Null(result.RecordId);
        Assert.NotEmpty(result.Reasons);
    }
}
