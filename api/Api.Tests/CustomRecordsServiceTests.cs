// Unit tests for CustomRecordsService (Slice 1b). Covers the pure required-field validation and the
// database-free branches: object-not-found (→ NotFound), required-field / blank-name validation
// (→ ValidationFailed), read-not-found (→ null), and cancellation propagation. The proc-backed
// happy/not-found paths (create/patch/delete over dbo.CustomRecords) are covered by the tSQLt tests
// and the LocalDB smoke run — they need a real relational provider, not a unit-test double.

using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.CustomRecords;
using McDermott.AiTracker.Api.Modules.Fields;
using McDermott.AiTracker.Api.Modules.Objects;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class CustomRecordsServiceTests
{
    private static readonly Guid Ws = new("F0000000-0000-4000-8000-000000000001");
    private static readonly Guid ObjId = new("F0000000-0000-4000-8000-000000000002");
    private static readonly Guid User = new("F0000000-0000-4000-8000-000000000004");

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    // The context is never touched on the tested branches (they short-circuit before any _db access),
    // so an unconfigured options object is enough — construction does not require a provider.
    private static AppDbContext Db() => new(new DbContextOptionsBuilder<AppDbContext>().Options);

    private static ObjectDefinitionDto Object(string objectKey = "vendor") => new(
        ObjId, Ws, objectKey, "Vendor", "Vendors", "LocalWorkspace", null,
        ShowInSidebar: true, SidebarCategory: null, RecordsCount: 0, FieldsCount: 0, IsSystem: false);

    private static Dictionary<string, JsonElement> Fields(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json, JsonOptions)!;

    private static (CustomRecordsService Sut, Mock<IObjectSchemaService> Objects, Mock<IFieldSchemaService> FieldsMock) Build()
    {
        var objects = new Mock<IObjectSchemaService>();
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.GetRequiredFieldKeysAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<string>());
        return (new CustomRecordsService(Db(), objects.Object, fields.Object), objects, fields);
    }

    // ─── Pure validation ───────────────────────────────────────────────────────

    [Fact]
    public void ValidateRequiredFields_MissingKey_YieldsError()
    {
        var errors = CustomRecordsService.ValidateRequiredFields(new[] { "rating" }, new Dictionary<string, JsonElement>());
        Assert.Contains("rating", errors.Keys);
    }

    [Fact]
    public void ValidateRequiredFields_PresentAndNonEmpty_NoError()
    {
        var errors = CustomRecordsService.ValidateRequiredFields(new[] { "rating" }, Fields("""{"rating":5}"""));
        Assert.Empty(errors);
    }

    [Fact]
    public void ValidateRequiredFields_EmptyStringArrayOrNull_YieldsError()
    {
        Assert.Contains("a", CustomRecordsService.ValidateRequiredFields(new[] { "a" }, Fields("""{"a":"   "}""")).Keys);
        Assert.Contains("b", CustomRecordsService.ValidateRequiredFields(new[] { "b" }, Fields("""{"b":[]}""")).Keys);
        Assert.Contains("c", CustomRecordsService.ValidateRequiredFields(new[] { "c" }, Fields("""{"c":null}""")).Keys);
    }

    // ─── Service branches (no database touched) ──────────────────────────────────

    [Fact]
    public async Task CreateAsync_ObjectNotFound_ReturnsNotFound()
    {
        var (sut, objects, _) = Build();
        objects.Setup(service => service.GetByIdAsync(ObjId, Ws, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ObjectDefinitionDto?)null);

        var result = await sut.CreateAsync(Ws, ObjId, new CustomRecordWriteRequest("Acme", null), User, CancellationToken.None);

        Assert.Equal(CustomRecordWriteOutcome.NotFound, result.Outcome);
    }

    [Fact]
    public async Task CreateAsync_MissingRequiredField_ReturnsValidationFailed()
    {
        var (sut, objects, fields) = Build();
        objects.Setup(service => service.GetByIdAsync(ObjId, Ws, It.IsAny<CancellationToken>())).ReturnsAsync(Object());
        fields.Setup(service => service.GetRequiredFieldKeysAsync(Ws, "vendor", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { "rating" });

        var result = await sut.CreateAsync(
            Ws, ObjId, new CustomRecordWriteRequest("Acme", new Dictionary<string, JsonElement>()), User, CancellationToken.None);

        Assert.Equal(CustomRecordWriteOutcome.ValidationFailed, result.Outcome);
        Assert.Contains("rating", result.Errors!.Keys);
    }

    [Fact]
    public async Task CreateAsync_BlankName_ReturnsValidationFailed()
    {
        var (sut, objects, _) = Build();
        objects.Setup(service => service.GetByIdAsync(ObjId, Ws, It.IsAny<CancellationToken>())).ReturnsAsync(Object());

        var result = await sut.CreateAsync(Ws, ObjId, new CustomRecordWriteRequest("   ", null), User, CancellationToken.None);

        Assert.Equal(CustomRecordWriteOutcome.ValidationFailed, result.Outcome);
        Assert.Contains("name", result.Errors!.Keys);
    }

    [Fact]
    public async Task CreateAsync_NameTooLong_ReturnsValidationFailed()
    {
        var (sut, objects, _) = Build();
        objects.Setup(service => service.GetByIdAsync(ObjId, Ws, It.IsAny<CancellationToken>())).ReturnsAsync(Object());

        var result = await sut.CreateAsync(
            Ws, ObjId, new CustomRecordWriteRequest(new string('x', 401), null), User, CancellationToken.None);

        Assert.Equal(CustomRecordWriteOutcome.ValidationFailed, result.Outcome);
        Assert.Contains("name", result.Errors!.Keys);
    }

    [Fact]
    public async Task GetByIdAsync_ObjectNotFound_ReturnsNull()
    {
        var (sut, objects, _) = Build();
        objects.Setup(service => service.GetByIdAsync(ObjId, Ws, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ObjectDefinitionDto?)null);

        var result = await sut.GetByIdAsync(Ws, ObjId, Guid.NewGuid(), CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task QueryAsync_ObjectNotFound_ReturnsNull()
    {
        var (sut, objects, _) = Build();
        objects.Setup(service => service.GetByIdAsync(ObjId, Ws, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ObjectDefinitionDto?)null);

        var result = await sut.QueryAsync(Ws, ObjId, new Modules.Requests.PaginatedQuery(), CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task CreateAsync_CancelledToken_Propagates()
    {
        var (sut, objects, _) = Build();
        objects.Setup(service => service.GetByIdAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .Returns((Guid _, Guid _, CancellationToken token) =>
            {
                token.ThrowIfCancellationRequested();
                return Task.FromResult<ObjectDefinitionDto?>(null);
            });

        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => sut.CreateAsync(Ws, ObjId, new CustomRecordWriteRequest("Acme", null), User, cts.Token));
    }
}
