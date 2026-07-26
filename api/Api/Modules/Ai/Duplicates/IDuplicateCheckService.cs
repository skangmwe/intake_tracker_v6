namespace McDermott.AiTracker.Api.Modules.Ai.Duplicates;

/// <summary>
/// On-demand, record-level duplicate detection (Phase 4, §14). Enforces the §14 guardrails in code:
/// permission-respecting (candidates come only from the retriever's WorkspaceMembership boundary plus a per-record
/// re-check; confirm re-gates both records), transparent / human-in-loop (nothing is applied without an explicit
/// confirm), and the data-sensitivity floor (only the workspace's allowlisted content ever reaches a provider).
/// Prompts, responses, and record content are never logged (api-pii-handling.md, api-logging.md).
/// </summary>
public interface IDuplicateCheckService
{
    /// <summary>
    /// Rank the likely duplicates of <paramref name="recordId"/> that the caller can see, each with a one-line
    /// AI rationale over the two records' allowlisted content. Returns empty when AI is disabled, the subject is
    /// not visible, the subject has no allowlisted content to compare, or nothing clears the similarity threshold.
    /// The subject record is always excluded from its own results.
    /// </summary>
    Task<IReadOnlyList<DuplicateCandidate>> CheckAsync(
        Guid workspaceId, Guid userId, string recordId, CancellationToken ct);

    /// <summary>
    /// Confirm the subject <paramref name="recordId"/> as a duplicate of <paramref name="duplicateOfRecordId"/>:
    /// re-gate the caller may act on both records, write the <c>duplicate-of</c> typed link carrying
    /// <paramref name="rationale"/>, and close the subject as <c>Duplicate</c> (whose closure event fans out the
    /// requestor notification). Reuses the existing close / typed-link / event-spine mechanisms — no new close or
    /// notify path.
    /// </summary>
    Task<ConfirmDuplicateResult> ConfirmAsync(
        Guid workspaceId,
        Guid userId,
        string recordId,
        string duplicateOfRecordId,
        string rationale,
        string operationId,
        CancellationToken ct);
}
