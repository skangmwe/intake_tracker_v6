// Unit tests for CustomRecordsService filter/sort marshalling (Slice A / Task A4) — the pure
// BuildFiltersJson / ResolveSort helpers that translate the record-list query into the JSON shape
// usp_QueryCustomRecords reads, plus the database-free QueryAsync branches (object-not-found → null,
// cancellation propagation). The proc-backed page read is covered by the tSQLt tests + LocalDB smoke.

using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.CustomRecords;
using McDermott.AiTracker.Api.Modules.Fields;
using McDermott.AiTracker.Api.Modules.Objects;
using McDermott.AiTracker.Api.Modules.Requests;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class CustomRecordsServiceQueryTests
{
    private static readonly Guid Ws = new("A0000000-0000-4000-8000-000000000001");
    private static readonly Guid ObjId = new("A0000000-0000-4000-8000-000000000002");

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static WorkspaceFieldSchemaDto SchemaWith(params (string Key, string Type)[] fields)
    {
        var defs = fields.Select(field => Field(field.Key, field.Type)).ToList();
        return new WorkspaceFieldSchemaDto(Ws, "vendor", defs, Array.Empty<PlatformFieldDto>());
    }

    private static FieldDefinitionDto Field(string key, string type) => new(
        Guid.NewGuid(), Ws, "vendor", key, key, type, "WorkspaceLocal",
        Section: null, HelpText: null, IsRequired: false, IsReadOnly: false, IsPlatformDefined: false,
        IsSystemProvisioned: false, Location: "LocalWorkspace", IsLocal: true, PlatformFieldKey: null,
        VisibleStages: null, CrossingToFieldKey: null, MinValue: null, MaxValue: null, AllowNewValues: false,
        SortOrder: 0, IsRetired: false, Options: Array.Empty<SelectOptionDto>(), Rules: Array.Empty<FieldRuleDto>(),
        Derived: null, CreatedAt: DateTime.UtcNow, UpdatedAt: DateTime.UtcNow);

    private static Dictionary<string, JsonElement> ParseFilters(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json, JsonOptions)!;

    // ─── BuildFiltersJson ────────────────────────────────────────────────────────

    [Fact]
    public void BuildFiltersJson_TextClause_EmitsContains()
    {
        var schema = SchemaWith(("notes", "ShortText"));
        var filters = ParseFilters("""{ "notes": { "kind":"text", "contains":"acme" } }""");

        var json = CustomRecordsService.BuildFiltersJson(filters, schema);

        Assert.NotNull(json);
        using var doc = JsonDocument.Parse(json!);
        var notes = doc.RootElement.GetProperty("notes");
        Assert.Equal("text", notes.GetProperty("type").GetString());
        Assert.Equal("acme", notes.GetProperty("contains").GetString());
    }

    [Fact]
    public void BuildFiltersJson_NumberClause_EmitsOpAndValue()
    {
        var schema = SchemaWith(("spend", "Number"));
        var filters = ParseFilters("""{ "spend": { "kind":"number", "op":">=", "value":10 } }""");

        var json = CustomRecordsService.BuildFiltersJson(filters, schema);

        Assert.NotNull(json);
        using var doc = JsonDocument.Parse(json!);
        var spend = doc.RootElement.GetProperty("spend");
        Assert.Equal("number", spend.GetProperty("type").GetString());
        Assert.Equal(">=", spend.GetProperty("op").GetString());
        Assert.Equal(10, spend.GetProperty("value").GetInt32());
    }

    [Fact]
    public void BuildFiltersJson_SelectClause_EmitsValues()
    {
        var schema = SchemaWith(("tier", "SingleSelect"));
        var filters = ParseFilters("""{ "tier": { "kind":"select", "values":["gold","silver"] } }""");

        var json = CustomRecordsService.BuildFiltersJson(filters, schema);

        Assert.NotNull(json);
        using var doc = JsonDocument.Parse(json!);
        var tier = doc.RootElement.GetProperty("tier");
        Assert.Equal("select", tier.GetProperty("type").GetString());
        var values = tier.GetProperty("values").EnumerateArray().Select(element => element.GetString()).ToArray();
        Assert.Equal(new[] { "gold", "silver" }, values);
    }

    [Fact]
    public void BuildFiltersJson_UnknownFieldKey_IsDropped()
    {
        var schema = SchemaWith(("spend", "Number"));
        var filters = ParseFilters(
            """{ "name": { "kind":"text", "contains":"acme" }, "mystery": { "kind":"text", "contains":"x" } }""");

        var json = CustomRecordsService.BuildFiltersJson(filters, schema);

        Assert.NotNull(json);
        using var doc = JsonDocument.Parse(json!);
        Assert.True(doc.RootElement.TryGetProperty("name", out _));       // stable column survives
        Assert.False(doc.RootElement.TryGetProperty("mystery", out _));   // not a real field → dropped
    }

    [Fact]
    public void BuildFiltersJson_OnlyUnknownKeys_ReturnsNull()
    {
        var schema = SchemaWith(("spend", "Number"));
        var filters = ParseFilters("""{ "mystery": { "kind":"text", "contains":"x" } }""");

        var json = CustomRecordsService.BuildFiltersJson(filters, schema);

        Assert.Null(json);
    }

    [Fact]
    public void BuildFiltersJson_CreatedRange_EmitsFromTo()
    {
        var schema = SchemaWith();
        var filters = ParseFilters("""{ "created": { "kind":"date", "from":"2026-01-01", "to":"2026-02-01" } }""");

        var json = CustomRecordsService.BuildFiltersJson(filters, schema);

        Assert.NotNull(json);
        using var doc = JsonDocument.Parse(json!);
        var created = doc.RootElement.GetProperty("created");
        Assert.Equal("date", created.GetProperty("type").GetString());
        Assert.Equal("2026-01-01", created.GetProperty("from").GetString());
        Assert.Equal("2026-02-01", created.GetProperty("to").GetString());
    }

    [Fact]
    public void BuildFiltersJson_Empty_ReturnsNull()
    {
        Assert.Null(CustomRecordsService.BuildFiltersJson(null, SchemaWith()));
        Assert.Null(CustomRecordsService.BuildFiltersJson(new Dictionary<string, JsonElement>(), SchemaWith()));
    }

    // ─── ResolveSort ─────────────────────────────────────────────────────────────

    [Fact]
    public void ResolveSort_FieldKey_ResolvesToKeyAndDirection()
    {
        var schema = SchemaWith(("spend", "Number"));

        var (column, direction) = CustomRecordsService.ResolveSort(
            new[] { new SortSpec { Column = "spend", Direction = "desc" } }, schema);

        Assert.Equal("spend", column);
        Assert.Equal("desc", direction);
    }

    [Fact]
    public void ResolveSort_StableColumn_Resolves()
    {
        var (column, direction) = CustomRecordsService.ResolveSort(
            new[] { new SortSpec { Column = "created", Direction = "asc" } }, SchemaWith());

        Assert.Equal("created", column);
        Assert.Equal("asc", direction);
    }

    [Fact]
    public void ResolveSort_UnknownColumn_FallsBackToName()
    {
        var (column, _) = CustomRecordsService.ResolveSort(
            new[] { new SortSpec { Column = "bogus", Direction = "desc" } }, SchemaWith(("spend", "Number")));

        Assert.Equal("name", column);
    }

    [Fact]
    public void ResolveSort_NoSort_DefaultsToNameAsc()
    {
        var (column, direction) = CustomRecordsService.ResolveSort(null, SchemaWith());

        Assert.Equal("name", column);
        Assert.Equal("asc", direction);
    }

    // ─── QueryAsync branches (no database touched) ───────────────────────────────

    private static (CustomRecordsService Sut, Mock<IObjectSchemaService> Objects) BuildService()
    {
        var objects = new Mock<IObjectSchemaService>();
        var fields = new Mock<IFieldSchemaService>();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().Options);
        return (new CustomRecordsService(db, objects.Object, fields.Object), objects);
    }

    [Fact]
    public async Task QueryAsync_ObjectNotFound_ReturnsNotFound()
    {
        // A foreign / absent object returns null (→ 404 at the controller), never disclosing existence.
        var (sut, objects) = BuildService();
        objects.Setup(service => service.GetByIdAsync(ObjId, Ws, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ObjectDefinitionDto?)null);

        var result = await sut.QueryAsync(Ws, ObjId, new PaginatedQuery(), CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task QueryAsync_CancelledToken_Propagates()
    {
        var (sut, objects) = BuildService();
        objects.Setup(service => service.GetByIdAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .Returns((Guid _, Guid _, CancellationToken token) =>
            {
                token.ThrowIfCancellationRequested();
                return Task.FromResult<ObjectDefinitionDto?>(null);
            });

        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => sut.QueryAsync(Ws, ObjId, new PaginatedQuery(), cts.Token));
    }
}
