// Unit tests for RequestIoObject (S28 export wizard) — the Request registry descriptor. Verifies the
// import/export field specs and that BuildExportAsync projects the access-filtered Requests query's
// Columns into an export dataset (paging across pages up to the row cap). IRequestsService is mocked.

using McDermott.AiTracker.Api.Modules.ImportExport;
using McDermott.AiTracker.Api.Modules.Requests;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class RequestIoObjectTests
{
    private static readonly Guid WorkspaceId = new("1A150000-0000-4000-8000-000000000001");

    private readonly Mock<IRequestsService> _requests = new();

    private RequestIoObject Build(ImportExportOptions? options = null) =>
        new(_requests.Object, Options.Create(options ?? new ImportExportOptions()));

    private static RequestListRow Row(string id, string name) =>
        new(id, "etag", new Dictionary<string, object?> { ["id"] = id, ["name"] = name }, null, RequestStatusHoldValue.InProgress);

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
        var dataset = await Build().BuildExportAsync(WorkspaceId, CancellationToken.None);

        // Assert — the dataset carries the export column specs and one dict row per record.
        Assert.Contains(dataset.Columns, column => column.Key == "id");
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
        var dataset = await Build(options).BuildExportAsync(WorkspaceId, CancellationToken.None);

        // Assert
        Assert.Single(dataset.Rows);
    }

    [Fact]
    public async Task BuildExportAsync_CancellationPropagates()
    {
        _requests
            .Setup(service => service.QueryAsync(WorkspaceId, It.IsAny<PaginatedQuery>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAsync<OperationCanceledException>(() => Build().BuildExportAsync(WorkspaceId, cts.Token));
    }
}
