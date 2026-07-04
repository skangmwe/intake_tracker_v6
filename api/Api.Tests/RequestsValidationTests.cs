// Unit tests for the pure request validation + query-translation helpers on RequestsService — no
// database, no mocks. Covers the cross-field create rules (name required, client-number conditional,
// 1–5 score bounds — BS §3.5) and the S2-grid filter/sort → proc-parameter translation.

using System.Text.Json;
using McDermott.AiTracker.Api.Modules.Requests;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class RequestsValidationTests
{
    private static Dictionary<string, JsonElement> Fields(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;

    [Fact]
    public void ValidateCreate_NameMissing_ReportsNameError()
    {
        // Arrange
        var request = new RequestCreateRequest { Name = "   " };

        // Act
        var errors = RequestsService.ValidateCreate(request);

        // Assert
        Assert.Contains("name", errors.Keys);
    }

    [Fact]
    public void ValidateCreate_ValidName_NoNameError()
    {
        // Arrange
        var request = new RequestCreateRequest { Name = "Contract clause finder" };

        // Act
        var errors = RequestsService.ValidateCreate(request);

        // Assert
        Assert.DoesNotContain("name", errors.Keys);
    }

    [Fact]
    public void ValidateCreate_ClientWithoutClientNumber_ReportsClientNumberError()
    {
        // Arrange
        var request = new RequestCreateRequest { Name = "x", Fields = Fields("""{ "deptPgClient": "Client" }""") };

        // Act
        var errors = RequestsService.ValidateCreate(request);

        // Assert
        Assert.Contains("clientNumber", errors.Keys);
    }

    [Fact]
    public void ValidateCreate_ClientWithClientNumber_NoClientNumberError()
    {
        // Arrange
        var request = new RequestCreateRequest { Name = "x", Fields = Fields("""{ "deptPgClient": "Client", "clientNumber": "12345" }""") };

        // Act
        var errors = RequestsService.ValidateCreate(request);

        // Assert
        Assert.DoesNotContain("clientNumber", errors.Keys);
    }

    [Fact]
    public void ValidateCreate_NonClientDept_ClientNumberNotRequired()
    {
        // Arrange
        var request = new RequestCreateRequest { Name = "x", Fields = Fields("""{ "deptPgClient": "Litigation" }""") };

        // Act
        var errors = RequestsService.ValidateCreate(request);

        // Assert
        Assert.DoesNotContain("clientNumber", errors.Keys);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(6)]
    [InlineData(-1)]
    public void ValidateCreate_ScoreOutOfRange_ReportsError(int value)
    {
        // Arrange
        var request = new RequestCreateRequest { Name = "x", Fields = Fields($$"""{ "businessValue": {{value}} }""") };

        // Act
        var errors = RequestsService.ValidateCreate(request);

        // Assert
        Assert.Contains("businessValue", errors.Keys);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(3)]
    [InlineData(5)]
    public void ValidateCreate_ScoreInRange_NoError(int value)
    {
        // Arrange
        var request = new RequestCreateRequest { Name = "x", Fields = Fields($$"""{ "efficiencyGain": {{value}} }""") };

        // Act
        var errors = RequestsService.ValidateCreate(request);

        // Assert
        Assert.DoesNotContain("efficiencyGain", errors.Keys);
    }

    [Fact]
    public void ValidateCreate_ScoreAbsent_NoError()
    {
        // Arrange — an omitted score is not validated (fields are optional at create).
        var request = new RequestCreateRequest { Name = "x", Fields = Fields("""{ "name": "x" }""") };

        // Act
        var errors = RequestsService.ValidateCreate(request);

        // Assert
        Assert.DoesNotContain("levelOfEffort", errors.Keys);
        Assert.DoesNotContain("businessValue", errors.Keys);
    }

    [Fact]
    public void BuildFiltersJson_MapsGridColumnsToProcKeys()
    {
        // Arrange — S2 grid keys stage/origin/analyst/name/priority/due → proc keys.
        var filters = Fields("""
        {
          "stage": { "kind": "select", "values": ["intake", "build"] },
          "origin": { "kind": "select", "values": ["Litigation"] },
          "analyst": { "kind": "select", "values": ["Priya Raman"] },
          "name": { "kind": "text", "contains": "extraction" },
          "priority": { "kind": "number", "op": ">=", "value": 4 },
          "due": { "kind": "date", "from": "2026-07-01", "to": "2026-07-31" }
        }
        """);

        // Act
        var json = RequestsService.BuildFiltersJson(filters);
        using var document = JsonDocument.Parse(json!);
        var root = document.RootElement;

        // Assert
        Assert.Equal("intake", root.GetProperty("stage")[0].GetString());
        Assert.Equal("Litigation", root.GetProperty("deptPgClient")[0].GetString());
        Assert.Equal("Priya Raman", root.GetProperty("analyst")[0].GetString());
        Assert.Equal("extraction", root.GetProperty("nameContains").GetString());
        Assert.Equal(">=", root.GetProperty("priorityOp").GetString());
        Assert.Equal(4, root.GetProperty("priorityValue").GetInt32());
        Assert.Equal("2026-07-01", root.GetProperty("dueFrom").GetString());
        Assert.Equal("2026-07-31", root.GetProperty("dueTo").GetString());
    }

    [Fact]
    public void BuildFiltersJson_UnsupportedColumns_Omitted()
    {
        // Arrange — id/desc/tags/repo have no proc filter support this slice.
        var filters = Fields("""
        {
          "id": { "kind": "text", "contains": "AI-" },
          "tags": { "kind": "select", "values": ["urgent"] },
          "repo": { "kind": "text", "contains": "github" }
        }
        """);

        // Act
        var json = RequestsService.BuildFiltersJson(filters);

        // Assert — nothing translatable → null (proc applies no filter).
        Assert.Null(json);
    }

    [Fact]
    public void BuildFiltersJson_NoFilters_ReturnsNull()
    {
        // Act + Assert
        Assert.Null(RequestsService.BuildFiltersJson(null));
        Assert.Null(RequestsService.BuildFiltersJson(new Dictionary<string, JsonElement>()));
    }

    [Fact]
    public void ResolveSort_MapsColumnAndDirection()
    {
        // Act
        var (column, direction) = RequestsService.ResolveSort(new[] { new SortSpec { Column = "priority", Direction = "desc" } });

        // Assert
        Assert.Equal("priority", column);
        Assert.Equal("desc", direction);
    }

    [Fact]
    public void ResolveSort_UnknownColumn_DefaultsToDueAsc()
    {
        // Act
        var (column, direction) = RequestsService.ResolveSort(new[] { new SortSpec { Column = "tags", Direction = "weird" } });

        // Assert
        Assert.Equal("due", column);
        Assert.Equal("asc", direction);
    }

    [Fact]
    public void ResolveSort_NoSort_DefaultsToDueAsc()
    {
        // Act
        var (column, direction) = RequestsService.ResolveSort(null);

        // Assert
        Assert.Equal("due", column);
        Assert.Equal("asc", direction);
    }

    [Theory]
    [InlineData("2026-07-01", "2026-07-04", "Overdue")]   // due before today
    [InlineData("2026-07-05", "2026-07-04", "DueSoon")]   // within 3 days
    [InlineData("2026-07-07", "2026-07-04", "DueSoon")]   // exactly today+3
    [InlineData("2026-07-30", "2026-07-04", null)]        // OnTrack → omitted this slice
    public void ComputeSla_ClassifiesByDueDate(string due, string today, string? expected)
    {
        // Act
        var result = RequestsService.ComputeSla(DateOnly.Parse(due), DateOnly.Parse(today));

        // Assert
        Assert.Equal(expected, result);
    }

    [Fact]
    public void ComputeSla_NoDueDate_ReturnsNull()
    {
        // Act + Assert
        Assert.Null(RequestsService.ComputeSla(null, new DateOnly(2026, 7, 4)));
    }
}
