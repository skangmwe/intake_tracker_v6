// Unit tests for RequestIoObject (S28 wizards; dynamic export — field-surfacing sweep slice 3a). The
// Request registry descriptor. Verifies the import field specs, that the export columns are derived
// from the workspace field catalog (identity "id" + the catalog fields), that BuildExportAsync projects
// each request's FieldValues JSON map into an export row (string / bool→Yes/No / array→joined / number),
// pages across pages up to the row cap, and that ImportRowAsync maps a row's create outcome to a
// landed/flagged result. IRequestsService is mocked; AppDbContext is constructed against an unused
// connection (the DB-touching Requestor-fallback path is covered by the import integration/tSQLt tests —
// here we exercise the no-DB branches).

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.ImportExport;
using McDermott.AiTracker.Api.Modules.Requests;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class RequestIoObjectTests
{
    private static readonly Guid WorkspaceId = new("1A150000-0000-4000-8000-000000000001");
    private static readonly Guid ActorId = Guid.NewGuid();

    private readonly Mock<IRequestsService> _requests = new();

    private static AppDbContext DbContext() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer("Server=(localdb)\\unused;Database=unused;Trusted_Connection=True")
            .Options);

    private RequestIoObject Build(ImportExportOptions? options = null) =>
        new(_requests.Object, DbContext(), Options.Create(options ?? new ImportExportOptions()));

    private static ImportRowContext Context() =>
        new(WorkspaceId, ActorId, "admin@firm.example", "op-1");

    private void SetupColumns(params (string Key, string Label)[] fields) =>
        _requests
            .Setup(service => service.GetRequestExportFieldsAsync(WorkspaceId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(fields.Select(field => new RequestExportField(field.Key, field.Label)).ToList());

    private void SetupExportPage(int page, params WorkspaceRequestExportRow[] rows) =>
        _requests
            .Setup(service => service.QueryWorkspaceRequestExportAsync(WorkspaceId, page, It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(rows);

    private static WorkspaceRequestExportRow ExportRow(string recordId, string fieldValuesJson) =>
        new() { RecordId = recordId, FieldValues = fieldValuesJson };

    private static RequestDto CreatedRequest(string id) =>
        new(
            Id: id, WorkspaceId: WorkspaceId, Origin: "AI Solutions",
            CreatedAt: DateTime.UtcNow, UpdatedAt: DateTime.UtcNow, CreatedBy: "seed", UpdatedBy: "seed",
            LegacyId: null, LifecycleId: Guid.NewGuid(), LifecycleName: "Standard delivery",
            Stages: System.Array.Empty<RequestStageRef>(), Stage: "intake",
            StatusHold: RequestStatusHoldValue.InProgress, StatusHoldNote: null,
            Hold: new HoldState(false, null), Outcome: null, DisplayStatus: "Intake", SlaStatus: null, TimeInStage: null,
            Name: "Imported", Description: null,
            Fields: new Dictionary<string, System.Text.Json.JsonElement>(StringComparer.Ordinal),
            Bridge: null, ETag: "AAAAAAAAAGQ=");

    [Fact]
    public async Task Metadata_IsImportableAndExportable_WithIdentityAndDynamicCatalogColumns()
    {
        // Arrange — the workspace catalog surfaces two Request fields; the export adds the identity.
        SetupColumns(("name", "Name"), ("dueDate", "Due Date"));
        var sut = Build();

        // Act
        var exportFields = await sut.GetExportFieldsAsync(WorkspaceId, ActorId, CancellationToken.None);

        // Assert
        Assert.Equal("Request", sut.ObjectType);
        Assert.True(sut.CanImport);
        Assert.True(sut.CanExport);
        // Identity "id" leads and is always included; the workspace catalog fields follow.
        Assert.Contains(exportFields, field => field.Key == "id" && field.AlwaysIncluded);
        Assert.Contains(exportFields, field => field.Key == "name");
        Assert.Contains(exportFields, field => field.Key == "dueDate");
        Assert.Contains(sut.ImportFields, field => field.Key == "name" && field.Required);
        // The requestor field is importable so a CSV can attribute the record.
        Assert.Contains(sut.ImportFields, field => field.Key == CsvRowMapper.RequestorFieldKey);
    }

    [Fact]
    public async Task BuildExportAsync_ProjectsFieldValuesByKey_WithIdentityAndFormatting()
    {
        // Arrange — three catalog columns and one request whose FieldValues carries them plus an extra.
        SetupColumns(("name", "Name"), ("holdBlocked", "Hold blocked"), ("complianceFlags", "Compliance flags"));
        SetupExportPage(1, ExportRow(
            "AIS-00000001",
            "{\"name\":\"Alpha\",\"holdBlocked\":true,\"complianceFlags\":[\"HIPAA\",\"GDPR\"],\"businessValue\":5}"));

        // Act
        var dataset = await Build().BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        // Assert — columns come from the catalog (identity + fields); values from the JSON map.
        Assert.NotNull(dataset);
        Assert.Contains(dataset!.Columns, column => column.Key == "id" && column.AlwaysIncluded);
        var row = Assert.Single(dataset.Rows);
        Assert.Equal("AIS-00000001", row["id"]);              // identity from RecordId, not the JSON
        Assert.Equal("Alpha", row["name"]);                   // string
        Assert.Equal("Yes", row["holdBlocked"]);              // bool → Yes/No
        Assert.Equal("HIPAA; GDPR", row["complianceFlags"]);  // array → joined
        Assert.Equal(5L, row["businessValue"]);               // number preserved (extra JSON key tolerated)
    }

    [Fact]
    public async Task BuildExportAsync_StopsAtRowCap()
    {
        // Arrange — a small export cap; the query returns more, but the descriptor trims.
        var options = new ImportExportOptions { MaxExportRows = 1 };
        SetupColumns(("name", "Name"));
        SetupExportPage(1, ExportRow("AIS-00000001", "{\"name\":\"Alpha\"}"), ExportRow("AIS-00000002", "{\"name\":\"Beta\"}"));

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
        SetupExportPage(2, ExportRow("AIS-99999999", "{\"name\":\"Last\"}"));

        // Act
        var dataset = await Build().BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        // Assert — both pages collected, and the second page was actually requested.
        Assert.NotNull(dataset);
        Assert.Equal(101, dataset!.Rows.Count);
        _requests.Verify(
            service => service.QueryWorkspaceRequestExportAsync(WorkspaceId, 2, It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task BuildExportAsync_CancellationPropagates()
    {
        _requests
            .Setup(service => service.GetRequestExportFieldsAsync(WorkspaceId, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAsync<OperationCanceledException>(() => Build().BuildExportAsync(WorkspaceId, ActorId, cts.Token));
    }

    [Fact]
    public async Task ImportRowAsync_NoRequestor_CreatesRequestAndLands()
    {
        // Arrange — a row with only a name (no requestor → no directory lookup).
        _requests
            .Setup(service => service.CreateAsync(
                WorkspaceId, It.IsAny<RequestCreateRequest>(), ActorId, "op-1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RequestCreateResult(RequestWriteOutcome.Success, CreatedRequest("AIS-00000009")));
        var fieldValues = new Dictionary<string, string?> { ["name"] = "Contract helper" };

        // Act
        var result = await Build().ImportRowAsync(Context(), fieldValues, CancellationToken.None);

        // Assert
        Assert.Equal(ImportRowResult.Landed, result.Outcome);
        Assert.Equal("AIS-00000009", result.RecordId);
        Assert.Empty(result.Reasons);
    }

    [Fact]
    public async Task ImportRowAsync_ValidationFails_FlagsWithReasons()
    {
        // Arrange — the create path reports a validation error (e.g. missing name).
        _requests
            .Setup(service => service.CreateAsync(
                WorkspaceId, It.IsAny<RequestCreateRequest>(), ActorId, "op-1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RequestCreateResult(
                RequestWriteOutcome.ValidationFailed,
                Errors: new Dictionary<string, string[]> { ["name"] = new[] { "A name is required." } }));
        var fieldValues = new Dictionary<string, string?> { ["description"] = "no name" };

        // Act
        var result = await Build().ImportRowAsync(Context(), fieldValues, CancellationToken.None);

        // Assert
        Assert.Equal(ImportRowResult.Flagged, result.Outcome);
        Assert.Null(result.RecordId);
        Assert.NotEmpty(result.Reasons);
    }

    [Fact]
    public async Task ImportRowAsync_DeniedOutcome_FlagsGeneric()
    {
        // Arrange — the create path denies (not a workspace member).
        _requests
            .Setup(service => service.CreateAsync(
                WorkspaceId, It.IsAny<RequestCreateRequest>(), ActorId, "op-1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RequestCreateResult(RequestWriteOutcome.Denied));
        var fieldValues = new Dictionary<string, string?> { ["name"] = "Blocked" };

        // Act
        var result = await Build().ImportRowAsync(Context(), fieldValues, CancellationToken.None);

        // Assert
        Assert.Equal(ImportRowResult.Flagged, result.Outcome);
        Assert.Null(result.RecordId);
        Assert.NotEmpty(result.Reasons);
    }
}
