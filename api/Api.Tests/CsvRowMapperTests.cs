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
}
