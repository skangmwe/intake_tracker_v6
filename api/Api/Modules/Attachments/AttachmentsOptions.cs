// Attachment validation limits, bound from the "Attachments" configuration section via IOptions<T>
// (api-blob-attachments.md — the max size and content-type allowlist come from config, enforced at
// the controller boundary before any bytes stream). Defaults here mirror appsettings.json so the
// app is safe if the section is absent; deployment overrides both values.

namespace McDermott.AiTracker.Api.Modules.Attachments;

public sealed class AttachmentsOptions
{
    public const string SectionName = "Attachments";

    /// <summary>Maximum upload size in bytes (BS §16 deployment default: 25 MB).</summary>
    public long MaxFileBytes { get; set; } = 26_214_400;

    /// <summary>Allowed upload content types. An upload outside this set is rejected with 400.</summary>
    public IReadOnlyList<string> ContentTypeAllowlist { get; set; } = new[]
    {
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
        "text/csv",
        "image/png",
        "image/jpeg",
        "image/gif",
    };
}
