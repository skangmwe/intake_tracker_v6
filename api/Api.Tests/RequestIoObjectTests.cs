// Unit tests for RequestIoObject (S28 wizards) — the Request registry descriptor. Verifies the
// import/export field specs, that BuildExportAsync projects the access-filtered Requests query's Columns
// into an export dataset (paging across pages up to the row cap), and that ImportRowAsync maps a row's
// create outcome to a landed/flagged result. IRequestsService is mocked; AppDbContext is constructed
// against an unused connection (the DB-touching Requestor-fallback path is covered by the import
// integration/tSQLt tests, matching TypedLinksServiceTests — here we exercise the no-DB branches).

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

    private static RequestListRow Row(string id, string name) =>
        new(id, "etag", new Dictionary<string, object?> { ["id"] = id, ["name"] = name }, null, RequestStatusHoldValue.InProgress);

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
    public void Metadata_IsImportableAndExportable_WithIdentityAndRequiredName()
    {
        var sut = Build();

        Assert.Equal("Request", sut.ObjectType);
        Assert.True(sut.CanImport);
        Assert.True(sut.CanExport);
        Assert.Contains(sut.ExportFields, field => field.Key == "id" && field.AlwaysIncluded);
        Assert.Contains(sut.ImportFields, field => field.Key == "name" && field.Required);
        // The requestor field is importable so a CSV can attribute the record.
        Assert.Contains(sut.ImportFields, field => field.Key == CsvRowMapper.RequestorFieldKey);
    }

    [Fact]
    public async Task BuildExportAsync_ProjectsRowColumns()
    {
        // Arrange — one page of two rows.
        _requests
            .Setup(service => service.QueryAsync(WorkspaceId, It.IsAny<PaginatedQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PaginatedResponse<RequestListRow>(
                new[] { Row("AIS-00000001", "Alpha"), Row("AIS-00000002", "Beta") }, 2, 1, 100));

        // Act
        var dataset = await Build().BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        // Assert — the dataset carries the export column specs and one dict row per record.
        Assert.NotNull(dataset);
        Assert.Contains(dataset!.Columns, column => column.Key == "id");
        Assert.Equal(2, dataset.Rows.Count);
        Assert.Equal("AIS-00000001", dataset.Rows[0]["id"]);
        Assert.Equal("Alpha", dataset.Rows[0]["name"]);
    }

    [Fact]
    public async Task BuildExportAsync_StopsAtRowCap()
    {
        // Arrange — a small export cap; the query would return more, but the descriptor trims.
        var options = new ImportExportOptions { MaxExportRows = 1 };
        _requests
            .Setup(service => service.QueryAsync(WorkspaceId, It.IsAny<PaginatedQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PaginatedResponse<RequestListRow>(
                new[] { Row("AIS-00000001", "Alpha"), Row("AIS-00000002", "Beta") }, 2, 1, 100));

        // Act
        var dataset = await Build(options).BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        // Assert
        Assert.NotNull(dataset);
        Assert.Single(dataset!.Rows);
    }

    [Fact]
    public async Task BuildExportAsync_CancellationPropagates()
    {
        _requests
            .Setup(service => service.QueryAsync(WorkspaceId, It.IsAny<PaginatedQuery>(), It.IsAny<CancellationToken>()))
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
