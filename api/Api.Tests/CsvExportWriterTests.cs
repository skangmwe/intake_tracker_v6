// Unit tests for CsvExportWriter (Slice 16 — pure CSV rendering for Export view). Covers the header
// labels, RFC-4180 escaping (comma / quote / newline), the default column set, date formatting, and a
// missing column rendering empty.

using System.Collections.Generic;
using McDermott.AiTracker.Api.Modules.ImportExport;
using McDermott.AiTracker.Api.Modules.Requests;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class CsvExportWriterTests
{
    private static RequestListRow Row(Dictionary<string, object?> columns) =>
        new("AIS-00000001", "AAAAAAAAAGQ=", columns, null);

    [Fact]
    public void Write_RendersLabelledHeaderAndRow()
    {
        // Arrange
        var columns = new[] { "id", "name", "due" };
        var rows = new[]
        {
            Row(new Dictionary<string, object?> { ["id"] = "AIS-00000001", ["name"] = "Helper", ["due"] = "2026-08-01" }),
        };

        // Act
        var lines = CsvExportWriter.Write(columns, rows).Split("\r\n", System.StringSplitOptions.RemoveEmptyEntries);

        // Assert — friendly labels on the header; values on the data row.
        Assert.Equal("Record ID,Name,Due Date", lines[0]);
        Assert.Equal("AIS-00000001,Helper,2026-08-01", lines[1]);
    }

    [Fact]
    public void Write_EscapesCommaQuoteAndNewline()
    {
        // Arrange — a name with a comma, an embedded quote, and a newline must be quoted + escaped.
        var rows = new[]
        {
            Row(new Dictionary<string, object?> { ["name"] = "Smith, \"Q3\" plan\nnext" }),
        };

        // Act
        var lines = CsvExportWriter.Write(new[] { "name" }, rows).Split("\r\n");

        // Assert — quotes doubled, whole field wrapped; the raw newline stays inside the quoted field.
        Assert.Contains("\"Smith, \"\"Q3\"\" plan\nnext\"", lines[1]);
    }

    [Fact]
    public void Write_EmptyColumns_UsesDefaultSet()
    {
        // Act
        var header = CsvExportWriter.Write(new List<string>(), System.Array.Empty<RequestListRow>()).Split("\r\n")[0];

        // Assert — the default id/name/stage/origin/due columns.
        Assert.Equal("Record ID,Name,Stage,Origin,Due Date", header);
    }

    [Fact]
    public void Write_MissingColumnValue_RendersEmptyCell()
    {
        // Arrange — the row has no "due" value.
        var rows = new[] { Row(new Dictionary<string, object?> { ["name"] = "Helper" }) };

        // Act
        var line = CsvExportWriter.Write(new[] { "name", "due" }, rows).Split("\r\n")[1];

        // Assert — trailing empty cell, not an exception.
        Assert.Equal("Helper,", line);
    }

    [Fact]
    public void Write_NeutralizesFormulaInjection_ButKeepsNegativeNumbers()
    {
        // Arrange — a formula-trigger name and a negative priority.
        var rows = new[]
        {
            Row(new Dictionary<string, object?> { ["name"] = "=cmd()", ["priority"] = -2 }),
        };

        // Act
        var line = CsvExportWriter.Write(new[] { "name", "priority" }, rows).Split("\r\n")[1];

        // Assert — the formula cell is quote-prefixed (rendered as text); the negative number is intact.
        Assert.Equal("'=cmd(),-2", line);
    }

    [Fact]
    public void LabelFor_UnknownKey_FallsBackToKey()
    {
        Assert.Equal("customField", CsvExportWriter.LabelFor("customField"));
        Assert.Equal("Assigned Analyst", CsvExportWriter.LabelFor("analyst"));
    }
}
