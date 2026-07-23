// Wire contracts for the Closure module (Slice 10 — api-contracts.md §3, §8). Property names
// serialize to camelCase (ASP.NET Core web defaults) so they mirror RequestCloseRequest + Outcome in
// /shared/types/requests.ts. Outcome notes are Confidential — never logged (api-pii-handling.md).

using System.ComponentModel.DataAnnotations;

namespace McDermott.AiTracker.Api.Modules.Closure;

/// <summary>POST /requests/{id}/close body.</summary>
public sealed class RequestCloseRequest
{
    [Required]
    public OutcomeInput? Outcome { get; set; }
}

/// <summary>
/// The Outcome captured at closure (BS §8). <c>Kind</c> disambiguates delivery vs PG-local; <c>Value</c>
/// is the terminal state. <c>Notes</c> are required by validation for every outcome except Live. The
/// "duplicates" relationship is captured as a linked record, so <c>DuplicateOfRecordId</c> is optional and
/// no longer collected by the close flow (retained for backward compatibility with stored outcomes).
/// </summary>
public sealed class OutcomeInput
{
    [Required]
    [RegularExpression("^(delivery|local)$")]
    public string? Kind { get; set; }

    [Required]
    [RegularExpression("^(Live|Declined|Withdrawn|Duplicate|NotPursued)$")]
    public string? Value { get; set; }

    public string? Notes { get; set; }

    [MaxLength(20)]
    public string? DuplicateOfRecordId { get; set; }
}
