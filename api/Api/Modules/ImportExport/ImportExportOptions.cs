// Import/Export limits, bound from the "ImportExport" configuration section via IOptions<T>
// (api-secrets.md — non-secret config; enforced at the controller boundary before any bytes stream).
// Defaults here mirror appsettings.json so the app is safe if the section is absent; deployment
// overrides them. A CSV import is bounded by MaxFileBytes (a create-only admin migration, far smaller
// than an attachment); MaxExportRows caps the streamed export so a runaway view can never build an
// unbounded response.

namespace McDermott.AiTracker.Api.Modules.ImportExport;

public sealed class ImportExportOptions
{
    public const string SectionName = "ImportExport";

    /// <summary>Maximum CSV upload size in bytes. Default 5 MB — a create-only admin import.</summary>
    public long MaxFileBytes { get; set; } = 5_242_880;

    /// <summary>Allowed CSV upload content types. Browsers vary in what they send for a .csv file.</summary>
    public IReadOnlyList<string> ContentTypeAllowlist { get; set; } = new[]
    {
        "text/csv",
        "application/csv",
        "application/vnd.ms-excel",
        "text/plain",
    };

    /// <summary>Hard cap on rows a single export streams — a bounded response, never unbounded.</summary>
    public int MaxExportRows { get; set; } = 10_000;
}
