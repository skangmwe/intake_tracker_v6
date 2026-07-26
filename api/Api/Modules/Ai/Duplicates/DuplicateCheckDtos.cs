using System.ComponentModel.DataAnnotations;

namespace McDermott.AiTracker.Api.Modules.Ai.Duplicates;

/// <summary>
/// Request body for confirming a subject record as a duplicate. <see cref="DuplicateOfRecordId"/> is the surviving
/// record the subject duplicates; <see cref="Rationale"/> is written into both the close notes and the
/// <c>duplicate-of</c> link's rationale slot. Both are required — a confirm without a target or a reason is a 400.
/// </summary>
public sealed class ConfirmDuplicateRequest
{
    [Required]
    [MaxLength(20)]
    public string? DuplicateOfRecordId { get; set; }

    [Required]
    public string? Rationale { get; set; }
}
