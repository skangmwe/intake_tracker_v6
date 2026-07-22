// Unit tests for FeatureIoObject (S28 wizards, Slice 2) — the Feature registry descriptor. Verifies the
// import/export field specs, that BuildExportAsync projects the hub-scoped Feature query into an export
// dataset (null when the caller is not a hub member → 403), and that ImportRowAsync guards the required
// Name/Type before creating and maps the create outcome to a landed/flagged result. IFeaturesService is
// mocked — the descriptor has no DbContext, so every branch is unit-testable.

using McDermott.AiTracker.Api.Modules.Features;
using McDermott.AiTracker.Api.Modules.ImportExport;
using McDermott.AiTracker.Api.Modules.Requests;
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

    private static FeatureListRowDto Row(string id, string name, IReadOnlyList<string> tags) =>
        new(
            Id: id, ETag: "etag", Name: name, OneLiner: "one-liner", FeatureType: "Functional",
            CapabilityTags: tags, TechStack: System.Array.Empty<string>(), Owner: "owner",
            Maturity: "Published", Origin: "AI Solutions", UpdatedAt: DateTime.UtcNow, ThumbnailUrl: null);

    private static FeatureDto CreatedFeature(string id) =>
        new(
            Id: id, WorkspaceId: WorkspaceId, CreatedAt: DateTime.UtcNow, UpdatedAt: DateTime.UtcNow,
            CreatedBy: "seed", UpdatedBy: "seed", Name: "Imported", OneLiner: string.Empty, WhatItDoes: string.Empty,
            FeatureType: "Functional", CapabilityTags: System.Array.Empty<string>(),
            SolutionPattern: System.Array.Empty<string>(), TechStack: System.Array.Empty<string>(),
            HowToReuse: string.Empty, DemoUrl: null, RepoUrl: null, Owner: string.Empty, Maturity: "Draft",
            DataClassification: null, ComplianceFlags: System.Array.Empty<string>(),
            SourcedFromRecordIds: System.Array.Empty<string>(), ETag: "AAAAAAAAAGQ=");

    private void SetupQuery(PaginatedResponse<FeatureListRowDto>? response) =>
        _features
            .Setup(service => service.QueryAsync(ActorId, It.IsAny<PaginatedQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(response);

    [Fact]
    public void Metadata_IsImportableAndExportable_WithIdentityAndRequiredFields()
    {
        var sut = Build();

        Assert.Equal("Feature", sut.ObjectType);
        Assert.True(sut.CanImport);
        Assert.True(sut.CanExport);
        Assert.Contains(sut.ExportFields, field => field.Key == "id" && field.AlwaysIncluded);
        Assert.Contains(sut.ImportFields, field => field.Key == "name" && field.Required);
        Assert.Contains(sut.ImportFields, field => field.Key == "featureType" && field.Required);
    }

    [Fact]
    public async Task BuildExportAsync_ProjectsRows_JoiningMultiValueFields()
    {
        // Arrange — one page of two features; capability tags are a multi-value field.
        SetupQuery(new PaginatedResponse<FeatureListRowDto>(
            new[]
            {
                Row("FEAT-00000001", "Alpha", new[] { "extract", "summarize" }),
                Row("FEAT-00000002", "Beta", System.Array.Empty<string>()),
            }, 2, 1, 100));

        // Act
        var dataset = await Build().BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        // Assert
        Assert.NotNull(dataset);
        Assert.Contains(dataset!.Columns, column => column.Key == "id");
        Assert.Equal(2, dataset.Rows.Count);
        Assert.Equal("FEAT-00000001", dataset.Rows[0]["id"]);
        Assert.Equal("Alpha", dataset.Rows[0]["name"]);
        Assert.Equal("extract; summarize", dataset.Rows[0]["capabilityTags"]);
    }

    [Fact]
    public async Task BuildExportAsync_NotHubMember_ReturnsNull()
    {
        // Arrange — QueryAsync returns null when the caller is not an AI-hub member.
        SetupQuery(null);

        // Act
        var dataset = await Build().BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        // Assert — a null dataset maps to 403 at the service, never a silent empty file.
        Assert.Null(dataset);
    }

    [Fact]
    public async Task BuildExportAsync_StopsAtRowCap()
    {
        // Arrange — a small export cap; the query would return more, but the descriptor trims.
        var options = new ImportExportOptions { MaxExportRows = 1 };
        SetupQuery(new PaginatedResponse<FeatureListRowDto>(
            new[]
            {
                Row("FEAT-00000001", "Alpha", System.Array.Empty<string>()),
                Row("FEAT-00000002", "Beta", System.Array.Empty<string>()),
            }, 2, 1, 100));

        // Act
        var dataset = await Build(options).BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        // Assert
        Assert.NotNull(dataset);
        Assert.Single(dataset!.Rows);
    }

    [Fact]
    public async Task BuildExportAsync_CancellationPropagates()
    {
        _features
            .Setup(service => service.QueryAsync(ActorId, It.IsAny<PaginatedQuery>(), It.IsAny<CancellationToken>()))
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
