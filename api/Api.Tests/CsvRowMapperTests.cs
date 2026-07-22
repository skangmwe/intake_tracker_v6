// Unit tests for CsvRowMapper (Slice 16 — pure CSV row → RequestCreateRequest mapping). Covers header
// normalisation + aliasing, Name/Description extraction to the DTO fields, content fields onto the open
// map, Requestor extraction (resolved later by the runner), unknown-header and empty-value handling.

using McDermott.AiTracker.Api.Modules.ImportExport;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class CsvRowMapperTests
{
    [Fact]
    public void Map_KnownHeaders_PopulatesNameDescriptionAndFields()
    {
        // Arrange — header spelling/spacing varies; the mapper normalises it.
        var headers = new[] { "Request Name", "Description", "Business Value", "Level of Effort", "Dept/PG/Client" };
        var values = new string?[] { "Contract helper", "Pull clauses", "4", "2", "Client" };

        // Act
        var mapped = CsvRowMapper.Map(headers, values);

        // Assert
        Assert.Equal("Contract helper", mapped.Create.Name);
        Assert.Equal("Pull clauses", mapped.Create.Description);
        Assert.Equal("4", mapped.Create.Fields!["businessValue"].GetString());
        Assert.Equal("2", mapped.Create.Fields!["levelOfEffort"].GetString());
        Assert.Equal("Client", mapped.Create.Fields!["deptPgClient"].GetString());
        Assert.Null(mapped.RequestorValue);
    }

    [Fact]
    public void Map_RequestorColumn_ExtractedNotPlacedInFields()
    {
        // Arrange
        var headers = new[] { "Name", "Requestor Email" };
        var values = new string?[] { "Report builder", "alex@firm.example" };

        // Act
        var mapped = CsvRowMapper.Map(headers, values);

        // Assert — requestor is extracted for SSO resolution, not written to Fields yet.
        Assert.Equal("alex@firm.example", mapped.RequestorValue);
        Assert.False(mapped.Create.Fields!.ContainsKey(CsvRowMapper.RequestorFieldKey));
    }

    [Fact]
    public void Map_UnknownHeaders_AreIgnored()
    {
        // Arrange
        var headers = new[] { "Name", "Some Custom Column" };
        var values = new string?[] { "A", "ignored" };

        // Act
        var mapped = CsvRowMapper.Map(headers, values);

        // Assert
        Assert.Equal("A", mapped.Create.Name);
        Assert.Empty(mapped.Create.Fields!);
    }

    [Fact]
    public void Map_EmptyAndWhitespaceValues_AreSkipped()
    {
        // Arrange
        var headers = new[] { "Name", "Business Value" };
        var values = new string?[] { "  A  ", "   " };

        // Act
        var mapped = CsvRowMapper.Map(headers, values);

        // Assert — trimmed name kept; blank score skipped entirely.
        Assert.Equal("A", mapped.Create.Name);
        Assert.False(mapped.Create.Fields!.ContainsKey("businessValue"));
    }

    [Theory]
    [InlineData("Business Value", "businessvalue")]
    [InlineData("dept/pg/client", "deptpgclient")]
    [InlineData("  Requestor_Email ", "requestoremail")]
    [InlineData("", "")]
    public void Normalise_StripsNonAlphanumericAndLowercases(string header, string expected)
    {
        Assert.Equal(expected, CsvRowMapper.Normalise(header));
    }

    // ─── MapFromMapping (explicit wizard column→field mapping) ─────────────────

    [Fact]
    public void MapFromMapping_RoutesNameDescriptionRequestorAndFields()
    {
        // Arrange — columns: 0 name, 1 description, 2 requestor, 3 a content field.
        var mapping = new[]
        {
            new ImportColumnMapping(0, "name"),
            new ImportColumnMapping(1, "description"),
            new ImportColumnMapping(2, CsvRowMapper.RequestorFieldKey),
            new ImportColumnMapping(3, "businessValue"),
        };
        var values = new string?[] { "Contract helper", "Pull clauses", "alex@firm.example", "4" };

        // Act
        var mapped = CsvRowMapper.MapFromMapping(mapping, values);

        // Assert
        Assert.Equal("Contract helper", mapped.Create.Name);
        Assert.Equal("Pull clauses", mapped.Create.Description);
        Assert.Equal("alex@firm.example", mapped.RequestorValue);
        Assert.False(mapped.Create.Fields!.ContainsKey(CsvRowMapper.RequestorFieldKey));
        Assert.Equal("4", mapped.Create.Fields!["businessValue"].GetString());
    }

    [Fact]
    public void MapFromMapping_SkipsBlankCellsAndOutOfRangeColumns()
    {
        // Arrange — column 1 is blank; column 5 is out of range.
        var mapping = new[]
        {
            new ImportColumnMapping(0, "name"),
            new ImportColumnMapping(1, "businessValue"),
            new ImportColumnMapping(5, "clientNumber"),
        };
        var values = new string?[] { "Alpha", "   ", "Ignored" };

        // Act
        var mapped = CsvRowMapper.MapFromMapping(mapping, values);

        // Assert — name kept; blank + out-of-range skipped entirely.
        Assert.Equal("Alpha", mapped.Create.Name);
        Assert.False(mapped.Create.Fields!.ContainsKey("businessValue"));
        Assert.False(mapped.Create.Fields!.ContainsKey("clientNumber"));
    }

    [Fact]
    public void MapFromMapping_FirstMappingToAFieldWins()
    {
        // Arrange — two columns both target "name"; the first non-empty value wins.
        var mapping = new[] { new ImportColumnMapping(0, "name"), new ImportColumnMapping(1, "name") };
        var values = new string?[] { "First", "Second" };

        // Act
        var mapped = CsvRowMapper.MapFromMapping(mapping, values);

        // Assert
        Assert.Equal("First", mapped.Create.Name);
    }
}
