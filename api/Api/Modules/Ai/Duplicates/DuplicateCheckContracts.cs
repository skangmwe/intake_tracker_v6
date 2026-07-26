namespace McDermott.AiTracker.Api.Modules.Ai.Duplicates;

/// <summary>
/// A likely-duplicate match for a subject record (Phase 4, §14 duplicate check). <paramref name="Score"/> is
/// the retriever's hybrid rank (semantic + keyword, higher = closer); <paramref name="Rationale"/> is a one-line
/// AI-generated explanation, built only from the two records' allowlisted content, shown AI-labelled so the caller
/// can judge the match. Title and rationale are Confidential — never logged.
/// </summary>
public sealed record DuplicateCandidate(string RecordId, string Title, double Score, string Rationale);

/// <summary>The outcome of a confirm-as-duplicate — the controller maps it to 204 / 403 / 400.</summary>
public enum ConfirmDuplicateOutcome
{
    /// <summary>The subject was closed as Duplicate, the <c>duplicate-of</c> link written, and the notify event fired.</summary>
    Confirmed,

    /// <summary>The caller cannot see or act on the subject record (→ 403, never 404).</summary>
    SubjectDenied,

    /// <summary>The duplicate target is missing, not visible to the caller, or not a valid duplicate target (→ 400).</summary>
    TargetInvalid,
}

/// <summary>The result of <see cref="IDuplicateCheckService.ConfirmAsync"/>.</summary>
public sealed record ConfirmDuplicateResult(ConfirmDuplicateOutcome Outcome);
