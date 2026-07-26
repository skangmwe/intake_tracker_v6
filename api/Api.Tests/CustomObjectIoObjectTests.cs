using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using McDermott.AiTracker.Api.Modules.CustomRecords;
using McDermott.AiTracker.Api.Modules.ImportExport;
using McDermott.AiTracker.Api.Modules.Requests;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class CustomObjectIoObjectTests
{
    private static readonly Guid ObjectId = Guid.Parse("cccccccc-0000-4000-8000-000000000001");
    private const string Slug = "vendor";
    private const int MaxRows = 1000;

    private static JsonElement Str(string value) =>
        JsonSerializer.SerializeToElement(value, new JsonSerializerOptions(JsonSerializerDefaults.Web));

    private static IReadOnlyList<IoFieldSpec> ExportFields() =>
    [
        new("id", "Record ID", AlwaysIncluded: true),
        new("name", "Name", AlwaysIncluded: true),
        new("vendorName", "Vendor name"),
        new("seatCount", "Seats"),
    ];

    private static IReadOnlyList<IoFieldSpec> ImportFields() =>
    [
        new("name", "Name", Required: true),
        new("vendorName", "Vendor name", Required: true),
        new("seatCount", "Seats"),
    ];

    private static CustomObjectIoObject Build(Mock<ICustomRecordsService> records) =>
        new(ObjectId, Slug, "Vendors", ExportFields(), ImportFields(), records.Object, MaxRows);

    private static CustomRecordListRow Row(string name) =>
        new(Guid.NewGuid(), name, new Dictionary<string, JsonElement> { ["vendorName"] = Str(name) }, "etag");

    [Fact]
    public void Metadata_UsesSlugAndLabel_AndIsBothDirections()
    {
        var sut = Build(new Mock<ICustomRecordsService>());

        Assert.Equal("vendor", sut.ObjectType);
        Assert.Equal("Vendors", sut.Label);
        Assert.True(sut.CanImport);
        Assert.True(sut.CanExport);
        Assert.True(sut.CanUpsert);
        Assert.Empty(sut.CatalogFields);
        Assert.Equal(new[] { "name", "vendorName", "seatCount" }, sut.ImportFields.Select(f => f.Key));
    }

    [Fact]
    public async Task GetExportFieldsAsync_ReturnsPrecomputedColumns()
    {
        var sut = Build(new Mock<ICustomRecordsService>());

        var fields = await sut.GetExportFieldsAsync(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

        Assert.Equal(new[] { "id", "name", "vendorName", "seatCount" }, fields.Select(f => f.Key));
        Assert.True(fields[0].AlwaysIncluded);
        Assert.True(fields[1].AlwaysIncluded);
    }

    [Fact]
    public async Task BuildExportAsync_ProjectsRows_WithIdAndNameInjected()
    {
        var workspaceId = Guid.NewGuid();
        var records = new Mock<ICustomRecordsService>();
        var recordId = Guid.Parse("dddddddd-0000-4000-8000-000000000001");
        var page = new PaginatedResponse<CustomRecordListRow>(
            new[]
            {
                new CustomRecordListRow(
                    recordId, "Acme",
                    new Dictionary<string, JsonElement> { ["vendorName"] = Str("Acme Inc"), ["seatCount"] = Str("42") },
                    "etag"),
            },
            TotalCount: 1, Page: 1, PageSize: 100);
        records
            .Setup(s => s.QueryAsync(workspaceId, ObjectId, It.IsAny<PaginatedQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(page);
        var sut = Build(records);

        var dataset = await sut.BuildExportAsync(workspaceId, Guid.NewGuid(), CancellationToken.None);

        Assert.NotNull(dataset);
        var row = Assert.Single(dataset!.Rows);
        Assert.Equal(recordId.ToString(), row["id"]);
        Assert.Equal("Acme", row["name"]);
        Assert.Equal("Acme Inc", row["vendorName"]);
    }

    [Fact]
    public async Task BuildExportAsync_NullPage_ReturnsNull()
    {
        var workspaceId = Guid.NewGuid();
        var records = new Mock<ICustomRecordsService>();
        records
            .Setup(s => s.QueryAsync(workspaceId, ObjectId, It.IsAny<PaginatedQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((PaginatedResponse<CustomRecordListRow>?)null);
        var sut = Build(records);

        var dataset = await sut.BuildExportAsync(workspaceId, Guid.NewGuid(), CancellationToken.None);

        Assert.Null(dataset);
    }

    [Fact]
    public async Task ImportRowAsync_Success_ReturnsLanded_DropsUnknownKeys()
    {
        var workspaceId = Guid.NewGuid();
        var newId = Guid.Parse("eeeeeeee-0000-4000-8000-000000000001");
        var records = new Mock<ICustomRecordsService>();
        CustomRecordWriteRequest? captured = null;
        records
            .Setup(s => s.CreateAsync(workspaceId, ObjectId, It.IsAny<CustomRecordWriteRequest>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .Callback<Guid, Guid, CustomRecordWriteRequest, Guid, CancellationToken>((_, _, req, _, _) => captured = req)
            .ReturnsAsync(new CustomRecordWriteResult(
                CustomRecordWriteOutcome.Success,
                new CustomRecordDto(newId, ObjectId, "Acme", new Dictionary<string, JsonElement>(), default, default, "u", "e")));
        var sut = Build(records);
        var context = new ImportRowContext(workspaceId, Guid.NewGuid(), "admin@firm.com", "op");
        var values = new Dictionary<string, string?>
        {
            ["name"] = "Acme",
            ["vendorName"] = "Acme Inc",
            ["deptPgClient"] = "leaked-request-alias-key", // not in this object's schema
        };

        var result = await sut.ImportRowAsync(context, values, CancellationToken.None);

        Assert.Equal(ImportRowResult.Landed, result.Outcome);
        Assert.Equal(newId.ToString(), result.RecordId);
        Assert.Equal("Acme", captured!.Name);
        Assert.True(captured.Fields!.ContainsKey("vendorName"));
        Assert.False(captured.Fields!.ContainsKey("deptPgClient")); // unknown key dropped
        Assert.False(captured.Fields!.ContainsKey("name"));         // name is the first-class column, not a field
    }

    [Fact]
    public async Task ImportRowAsync_ValidationFailed_ReturnsFlaggedWithReasons()
    {
        var workspaceId = Guid.NewGuid();
        var records = new Mock<ICustomRecordsService>();
        records
            .Setup(s => s.CreateAsync(workspaceId, ObjectId, It.IsAny<CustomRecordWriteRequest>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CustomRecordWriteResult(
                CustomRecordWriteOutcome.ValidationFailed,
                Errors: new Dictionary<string, string[]> { ["name"] = new[] { "A record name is required." } }));
        var sut = Build(records);
        var context = new ImportRowContext(workspaceId, Guid.NewGuid(), "admin@firm.com", "op");

        var result = await sut.ImportRowAsync(context, new Dictionary<string, string?> { ["vendorName"] = "x" }, CancellationToken.None);

        Assert.Equal(ImportRowResult.Flagged, result.Outcome);
        Assert.Contains(result.Reasons, r => r.Field == "name");
    }

    [Fact]
    public async Task ImportRowAsync_NotFound_ReturnsFlaggedGeneric()
    {
        var workspaceId = Guid.NewGuid();
        var records = new Mock<ICustomRecordsService>();
        records
            .Setup(s => s.CreateAsync(workspaceId, ObjectId, It.IsAny<CustomRecordWriteRequest>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CustomRecordWriteResult(CustomRecordWriteOutcome.NotFound));
        var sut = Build(records);
        var context = new ImportRowContext(workspaceId, Guid.NewGuid(), "admin@firm.com", "op");

        var result = await sut.ImportRowAsync(context, new Dictionary<string, string?> { ["name"] = "Acme" }, CancellationToken.None);

        Assert.Equal(ImportRowResult.Flagged, result.Outcome);
        Assert.NotEmpty(result.Reasons);
    }

    [Fact]
    public async Task BuildExportAsync_PagesPastAFullBatch()
    {
        var workspaceId = Guid.NewGuid();
        var records = new Mock<ICustomRecordsService>();
        var page1 = new PaginatedResponse<CustomRecordListRow>(
            Enumerable.Range(0, 100).Select(index => Row($"r{index}")).ToList(), TotalCount: 130, Page: 1, PageSize: 100);
        var page2 = new PaginatedResponse<CustomRecordListRow>(
            Enumerable.Range(100, 30).Select(index => Row($"r{index}")).ToList(), TotalCount: 130, Page: 2, PageSize: 100);
        records
            .Setup(s => s.QueryAsync(workspaceId, ObjectId, It.Is<PaginatedQuery>(q => q.Page == 1), It.IsAny<CancellationToken>()))
            .ReturnsAsync(page1);
        records
            .Setup(s => s.QueryAsync(workspaceId, ObjectId, It.Is<PaginatedQuery>(q => q.Page == 2), It.IsAny<CancellationToken>()))
            .ReturnsAsync(page2);
        var sut = Build(records);

        var dataset = await sut.BuildExportAsync(workspaceId, Guid.NewGuid(), CancellationToken.None);

        Assert.NotNull(dataset);
        Assert.Equal(130, dataset!.Rows.Count);
        records.Verify(s => s.QueryAsync(workspaceId, ObjectId, It.Is<PaginatedQuery>(q => q.Page == 2), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task BuildExportAsync_TrimsAtMaxExportRows()
    {
        var workspaceId = Guid.NewGuid();
        var records = new Mock<ICustomRecordsService>();
        var fullPage = new PaginatedResponse<CustomRecordListRow>(
            Enumerable.Range(0, 100).Select(index => Row($"r{index}")).ToList(), TotalCount: 500, Page: 1, PageSize: 100);
        records
            .Setup(s => s.QueryAsync(workspaceId, ObjectId, It.IsAny<PaginatedQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(fullPage);
        var sut = new CustomObjectIoObject(ObjectId, Slug, "Vendors", ExportFields(), ImportFields(), records.Object, maxExportRows: 40);

        var dataset = await sut.BuildExportAsync(workspaceId, Guid.NewGuid(), CancellationToken.None);

        Assert.NotNull(dataset);
        Assert.Equal(40, dataset!.Rows.Count);
    }

    private static ImportRowContext UpsertCtx(Guid ws) =>
        new(ws, Guid.NewGuid(), "admin@firm.com", "op", ImportMode.Upsert);

    [Fact]
    public async Task ImportRowAsync_Upsert_BlankId_CreatesRecord()
    {
        var ws = Guid.NewGuid();
        var records = new Mock<ICustomRecordsService>();
        records.Setup(s => s.CreateAsync(ws, ObjectId, It.IsAny<CustomRecordWriteRequest>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CustomRecordWriteResult(CustomRecordWriteOutcome.Success,
                new CustomRecordDto(Guid.NewGuid(), ObjectId, "Acme", new Dictionary<string, JsonElement>(), default, default, "u", "e")));
        var sut = Build(records);

        var result = await sut.ImportRowAsync(UpsertCtx(ws),
            new Dictionary<string, string?> { ["name"] = "Acme", ["vendorName"] = "Acme Inc" }, CancellationToken.None);

        Assert.Equal(ImportRowResult.Landed, result.Outcome);
        Assert.Equal(ImportAction.Created, result.Action);
        records.Verify(s => s.GetByIdAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ImportRowAsync_Upsert_FoundId_MergesAndUpdates()
    {
        var ws = Guid.NewGuid();
        var recordId = Guid.Parse("dddddddd-0000-4000-8000-000000000abc");
        var records = new Mock<ICustomRecordsService>();
        records.Setup(s => s.GetByIdAsync(ws, ObjectId, recordId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CustomRecordDto(recordId, ObjectId, "Old name",
                new Dictionary<string, JsonElement> { ["vendorName"] = Str("Old vendor"), ["seatCount"] = Str("9") },
                default, default, "u", "e"));
        CustomRecordWriteRequest? patched = null;
        records.Setup(s => s.PatchAsync(ws, ObjectId, recordId, It.IsAny<CustomRecordWriteRequest>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .Callback<Guid, Guid, Guid, CustomRecordWriteRequest, Guid, CancellationToken>((_, _, _, req, _, _) => patched = req)
            .ReturnsAsync(new CustomRecordWriteResult(CustomRecordWriteOutcome.Success,
                new CustomRecordDto(recordId, ObjectId, "New name", new Dictionary<string, JsonElement>(), default, default, "u", "e")));
        var sut = Build(records);

        // CSV maps id + name + vendorName (not seatCount) → seatCount preserved, vendorName overwritten, name updated.
        var result = await sut.ImportRowAsync(UpsertCtx(ws),
            new Dictionary<string, string?> { ["id"] = recordId.ToString(), ["name"] = "New name", ["vendorName"] = "New vendor" },
            CancellationToken.None);

        Assert.Equal(ImportRowResult.Landed, result.Outcome);
        Assert.Equal(ImportAction.Updated, result.Action);
        Assert.Equal("New name", patched!.Name);
        Assert.True(patched.Fields!.ContainsKey("seatCount"));   // preserved from existing
        Assert.True(patched.Fields!.ContainsKey("vendorName"));  // overwritten
        Assert.False(patched.Fields!.ContainsKey("id"));         // id never written as data
    }

    [Fact]
    public async Task ImportRowAsync_Upsert_FoundId_NoNameColumn_KeepsExistingName()
    {
        var ws = Guid.NewGuid();
        var recordId = Guid.Parse("dddddddd-0000-4000-8000-000000000def");
        var records = new Mock<ICustomRecordsService>();
        records.Setup(s => s.GetByIdAsync(ws, ObjectId, recordId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CustomRecordDto(recordId, ObjectId, "Keep me", new Dictionary<string, JsonElement>(), default, default, "u", "e"));
        CustomRecordWriteRequest? patched = null;
        records.Setup(s => s.PatchAsync(ws, ObjectId, recordId, It.IsAny<CustomRecordWriteRequest>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .Callback<Guid, Guid, Guid, CustomRecordWriteRequest, Guid, CancellationToken>((_, _, _, req, _, _) => patched = req)
            .ReturnsAsync(new CustomRecordWriteResult(CustomRecordWriteOutcome.Success,
                new CustomRecordDto(recordId, ObjectId, "Keep me", new Dictionary<string, JsonElement>(), default, default, "u", "e")));
        var sut = Build(records);

        await sut.ImportRowAsync(UpsertCtx(ws),
            new Dictionary<string, string?> { ["id"] = recordId.ToString(), ["vendorName"] = "x" }, CancellationToken.None);

        Assert.Equal("Keep me", patched!.Name); // no name column → existing name kept
    }

    [Fact]
    public async Task ImportRowAsync_Upsert_InvalidGuid_Flags()
    {
        var sut = Build(new Mock<ICustomRecordsService>());
        var result = await sut.ImportRowAsync(UpsertCtx(Guid.NewGuid()),
            new Dictionary<string, string?> { ["id"] = "not-a-guid", ["name"] = "x" }, CancellationToken.None);
        Assert.Equal(ImportRowResult.Flagged, result.Outcome);
        Assert.Contains(result.Reasons, r => r.Code == "invalid-id");
    }

    [Fact]
    public async Task ImportRowAsync_Upsert_DeadId_Flags()
    {
        var ws = Guid.NewGuid();
        var recordId = Guid.Parse("dddddddd-0000-4000-8000-0000000000ff");
        var records = new Mock<ICustomRecordsService>();
        records.Setup(s => s.GetByIdAsync(ws, ObjectId, recordId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((CustomRecordDto?)null);
        var sut = Build(records);
        var result = await sut.ImportRowAsync(UpsertCtx(ws),
            new Dictionary<string, string?> { ["id"] = recordId.ToString(), ["name"] = "x" }, CancellationToken.None);
        Assert.Equal(ImportRowResult.Flagged, result.Outcome);
        Assert.Contains(result.Reasons, r => r.Code == "record-not-found");
    }
}
