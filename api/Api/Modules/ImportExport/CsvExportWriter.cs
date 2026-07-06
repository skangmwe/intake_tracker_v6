// Pure CSV writer for the Export-view path (Slice 16 — BS §13, S28). Renders the saved view's columns
// as a header row (friendly labels) plus one CSV line per already-access-filtered RequestListRow.
// Every field is RFC-4180-escaped (wrapped in quotes with internal quotes doubled when it contains a
// comma, quote, CR, or LF), so a comma or newline inside a value can never break the column layout.
// No IO — fully unit-tested. Row values are Confidential — the caller writes the CSV to the response,
// never to a log.

using System.Globalization;
using System.Text;
using McDermott.AiTracker.Api.Modules.Requests;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

public static class CsvExportWriter
{
    // Grid column key -> friendly header label. Falls back to the key for anything unmapped.
    private static readonly IReadOnlyDictionary<string, string> ColumnLabels = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["id"] = "Record ID",
        ["name"] = "Name",
        ["desc"] = "Description",
        ["stage"] = "Stage",
        ["origin"] = "Origin",
        ["analyst"] = "Assigned Analyst",
        ["priority"] = "Priority",
        ["repo"] = "Repo URL",
        ["due"] = "Due Date",
    };

    // Used when a saved view carries no explicit column set.
    private static readonly IReadOnlyList<string> DefaultColumns = new[] { "id", "name", "stage", "origin", "due" };

    /// <summary>Render the rows as CSV text for the given column keys (view's columns, or the default set).</summary>
    public static string Write(IReadOnlyList<string>? columnKeys, IReadOnlyList<RequestListRow> rows)
    {
        var columns = columnKeys is { Count: > 0 } ? columnKeys : DefaultColumns;
        var builder = new StringBuilder();

        builder.AppendLine(string.Join(',', columns.Select(key => Escape(LabelFor(key)))));

        foreach (var row in rows)
        {
            var cells = columns.Select(key =>
                Escape(Neutralize(Format(row.Columns.TryGetValue(key, out var value) ? value : null))));
            builder.AppendLine(string.Join(',', cells));
        }

        return builder.ToString();
    }

    /// <summary>
    /// CSV formula-injection guard (OWASP): a cell beginning with a formula trigger executes when the
    /// CSV is opened in a spreadsheet. Prefix a single quote so the value renders as text. Guards
    /// <c>= + @</c> and leading tab/CR — deliberately NOT a leading <c>-</c>, so negative numbers
    /// (e.g. a priority of -2) are preserved; internal request data is the source, not attacker input.
    /// </summary>
    private static string Neutralize(string field)
    {
        if (field.Length == 0)
        {
            return field;
        }

        return field[0] switch
        {
            '=' or '+' or '@' or '\t' or '\r' => "'" + field,
            _ => field,
        };
    }

    public static string LabelFor(string columnKey) =>
        ColumnLabels.TryGetValue(columnKey, out var label) ? label : columnKey;

    private static string Format(object? value) => value switch
    {
        null => string.Empty,
        DateOnly date => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        DateTime dateTime => dateTime.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        IFormattable formattable => formattable.ToString(null, CultureInfo.InvariantCulture),
        _ => value.ToString() ?? string.Empty,
    };

    private static string Escape(string field)
    {
        if (field.IndexOfAny(new[] { ',', '"', '\r', '\n' }) < 0)
        {
            return field;
        }

        return string.Concat("\"", field.Replace("\"", "\"\""), "\"");
    }
}
