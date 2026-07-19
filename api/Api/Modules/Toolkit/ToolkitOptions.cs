// Toolkit upload validation limits, bound from the "Toolkit" configuration section via IOptions<T>
// (api-blob-attachments.md — the max size and the allowlist come from config, enforced at the
// controller boundary before any bytes stream). The S43 prototype's file picker gates by extension
// (accept=".md,.markdown,.txt,.docx,.pdf"), and browsers send inconsistent content types for
// markdown/text, so the allowlist here is extension-based to mirror the prototype reliably. Defaults
// mirror appsettings.json so the app is safe if the section is absent; deployment overrides both.

namespace McDermott.AiTracker.Api.Modules.Toolkit;

public sealed class ToolkitOptions
{
    public const string SectionName = "Toolkit";

    /// <summary>Maximum upload size in bytes (deployment default: 25 MB, matching Attachments).</summary>
    public long MaxFileBytes { get; set; } = 26_214_400;

    /// <summary>Allowed upload file extensions (lower-case, dot-prefixed). Mirrors the S43 picker.</summary>
    public IReadOnlyList<string> AllowedExtensions { get; set; } = new[]
    {
        ".md",
        ".markdown",
        ".txt",
        ".docx",
        ".pdf",
    };
}
