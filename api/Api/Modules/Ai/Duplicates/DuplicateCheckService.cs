using System.Diagnostics;
using System.Text;
using System.Text.Json;
using McDermott.AiTracker.Api.Modules.Ai.Config;
using McDermott.AiTracker.Api.Modules.Ai.Providers;
using McDermott.AiTracker.Api.Modules.Ai.Retrieval;
using McDermott.AiTracker.Api.Modules.Closure;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Modules.TypedLinks;
using McDermott.AiTracker.Api.Shared.Auth;

namespace McDermott.AiTracker.Api.Modules.Ai.Duplicates;

/// <summary>
/// Duplicate-check orchestrator. CheckAsync embeds the subject's allowlisted content, retrieves permission-safe
/// candidates via the shipped hybrid retriever, excludes the subject itself, keeps matches above a similarity
/// threshold, and asks the provider for a one-line rationale over each pair's allowlisted content. ConfirmAsync
/// reuses the existing close / typed-link / event-spine mechanisms to close the subject as Duplicate and write the
/// <c>duplicate-of</c> link — it builds no new close or notify path. The §14 guardrails live here: the off-switch,
/// the retriever's permission boundary + per-record re-check, human-in-loop confirm, and the data-sensitivity floor
/// (only allowlisted content reaches a provider). Content is never logged (api-pii-handling.md, api-logging.md).
/// </summary>
public sealed class DuplicateCheckService : IDuplicateCheckService
{
    // Retrieval breadth — the SimilarTopDefault / RetrievalTopK family (3 for the inline nudge, 5 for grounded Ask).
    // 5 keeps the ranked matches panel scannable while giving recall a little headroom. Not a routing threshold.
    private const int DuplicateTopK = 5;

    // Minimum hybrid score to treat a retrieved record as a likely duplicate. The retriever blends semantic cosine
    // (mapped to [0,1], weight 0.75) with a normalised keyword score (weight 0.25); 0.6 keeps moderate-to-strong
    // matches and drops weak ones. A stated starting point, tunable per corpus — the §14 admin threshold is deferred.
    private const double DuplicateThreshold = 0.6d;

    // A duplicate rationale is one short sentence — a small cap keeps latency and cost low. Not a routing threshold.
    private const int MaxRationaleTokens = 256;

    private const string RationaleSystemPrompt =
        "You compare two intake records to judge whether they are duplicates. In one short sentence, state why the " +
        "two records may describe the same underlying request, using ONLY the content provided. Never invent facts " +
        "that are not supported by that content. Do not produce legal conclusions or recommendations. Respond with " +
        "the single sentence only.";

    private readonly IAiConfigService _config;
    private readonly IEmbeddingService _embeddings;
    private readonly IRecordRetriever _retriever;
    private readonly IRequestsService _requests;
    private readonly ILlmProviderFactory _providers;
    private readonly ITypedLinksService _typedLinks;
    private readonly IClosureService _closure;
    private readonly IAccessGuard _accessGuard;
    private readonly ILogger<DuplicateCheckService> _logger;

    public DuplicateCheckService(
        IAiConfigService config,
        IEmbeddingService embeddings,
        IRecordRetriever retriever,
        IRequestsService requests,
        ILlmProviderFactory providers,
        ITypedLinksService typedLinks,
        IClosureService closure,
        IAccessGuard accessGuard,
        ILogger<DuplicateCheckService> logger)
    {
        _config = config;
        _embeddings = embeddings;
        _retriever = retriever;
        _requests = requests;
        _providers = providers;
        _typedLinks = typedLinks;
        _closure = closure;
        _accessGuard = accessGuard;
        _logger = logger;
    }

    public async Task<IReadOnlyList<DuplicateCandidate>> CheckAsync(
        Guid workspaceId, Guid userId, string recordId, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        // Off-switch (defence in depth — the controller already 403s a disabled workspace).
        var config = await _config.GetAsync(workspaceId, ct).ConfigureAwait(false);
        if (!config.Enabled)
        {
            return Array.Empty<DuplicateCandidate>();
        }

        // Load + re-check the subject on the caller's side; read only its allowlisted content.
        var subject = await _requests.GetByIdAsync(recordId, userId, ct).ConfigureAwait(false);
        if (subject is null)
        {
            return Array.Empty<DuplicateCandidate>();
        }

        var subjectContent = BuildAllowlistedContent(subject, config.ContentFieldAllowlist);
        if (string.IsNullOrWhiteSpace(subjectContent))
        {
            return Array.Empty<DuplicateCandidate>();
        }

        var embedding = await _embeddings.EmbedAsync(subjectContent, ct).ConfigureAwait(false);
        var retrieved = await _retriever
            .RetrieveAsync(workspaceId, userId, subjectContent, embedding, DuplicateTopK, ct)
            .ConfigureAwait(false);

        var stopwatch = Stopwatch.StartNew();
        var candidates = new List<DuplicateCandidate>();
        foreach (var match in retrieved)
        {
            // Never rank the subject as its own duplicate; drop weak matches below the threshold.
            if (string.Equals(match.RecordId, recordId, StringComparison.Ordinal) || match.Score < DuplicateThreshold)
            {
                continue;
            }

            // Re-check permission on the exact candidate and read only its allowlisted content.
            var candidateRecord = await _requests.GetByIdAsync(match.RecordId, userId, ct).ConfigureAwait(false);
            if (candidateRecord is null)
            {
                continue;
            }

            var candidateContent = BuildAllowlistedContent(candidateRecord, config.ContentFieldAllowlist);
            var rationale = await BuildRationaleAsync(subjectContent, candidateContent, ct).ConfigureAwait(false);
            candidates.Add(new DuplicateCandidate(match.RecordId, match.Title, match.Score, rationale));
        }

        _logger.LogInformation(
            "Duplicate check for a record in workspace {WorkspaceId}: {CandidateCount} candidates in {DurationMs}ms.",
            workspaceId, candidates.Count, stopwatch.ElapsedMilliseconds);

        return candidates;
    }

    public async Task<ConfirmDuplicateResult> ConfirmAsync(
        Guid workspaceId,
        Guid userId,
        string recordId,
        string duplicateOfRecordId,
        string rationale,
        string operationId,
        CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        // Re-gate the subject on the caller's side — a forbidden / missing record is a 403, never a 404.
        var subject = await _requests.GetByIdAsync(recordId, userId, ct).ConfigureAwait(false);
        if (subject is null)
        {
            return new ConfirmDuplicateResult(ConfirmDuplicateOutcome.SubjectDenied);
        }

        // Marking a record as duplicate is a mutation — the caller must be Member+ on the subject's own workspace
        // (not merely the route's), which closes a cross-workspace confirm hole. ClosureService re-checks this too.
        if (!await _accessGuard
            .HasWorkspaceLevelAsync(userId, subject.WorkspaceId, WorkspaceLevel.Member, ct)
            .ConfigureAwait(false))
        {
            return new ConfirmDuplicateResult(ConfirmDuplicateOutcome.SubjectDenied);
        }

        // The duplicate target must be a real record the caller can see, and not the subject itself.
        if (string.Equals(duplicateOfRecordId, recordId, StringComparison.Ordinal))
        {
            return new ConfirmDuplicateResult(ConfirmDuplicateOutcome.TargetInvalid);
        }

        var target = await _requests.GetByIdAsync(duplicateOfRecordId, userId, ct).ConfigureAwait(false);
        if (target is null)
        {
            return new ConfirmDuplicateResult(ConfirmDuplicateOutcome.TargetInvalid);
        }

        // Write the duplicate-of typed link first (its guards reject a target in a different workspace family / self),
        // then close as Duplicate — so a rejected link never leaves a closed-but-unlinked record.
        var link = await _typedLinks
            .AddLinkAsync(
                recordId,
                new AddLinkRequest { ToRecordId = duplicateOfRecordId, Kind = "duplicate-of", Rationale = rationale },
                userId, operationId, ct)
            .ConfigureAwait(false);
        switch (link.Outcome)
        {
            case AddLinkOutcome.Invalid:
                return new ConfirmDuplicateResult(ConfirmDuplicateOutcome.TargetInvalid);
            case AddLinkOutcome.Forbidden:
                return new ConfirmDuplicateResult(ConfirmDuplicateOutcome.SubjectDenied);
        }

        var close = await _closure
            .CloseAsync(
                recordId,
                new RequestCloseRequest
                {
                    Outcome = new OutcomeInput
                    {
                        // The existing close UI maps a Duplicate outcome to the PG-local family; mirror it here.
                        Kind = "local",
                        Value = "Duplicate",
                        Notes = rationale,
                        DuplicateOfRecordId = duplicateOfRecordId,
                    },
                },
                userId, operationId, ct)
            .ConfigureAwait(false);

        return close.Outcome switch
        {
            CloseOutcome.Success => new ConfirmDuplicateResult(ConfirmDuplicateOutcome.Confirmed),
            // A denial after we passed the Member gate means the subject slipped out of view — treat as denied.
            CloseOutcome.Denied => new ConfirmDuplicateResult(ConfirmDuplicateOutcome.SubjectDenied),
            // Notes are supplied (the rationale), so validation should pass; surface any residual issue as a 400.
            _ => new ConfirmDuplicateResult(ConfirmDuplicateOutcome.TargetInvalid),
        };
    }

    private async Task<string> BuildRationaleAsync(string subjectContent, string candidateContent, CancellationToken ct)
    {
        var content = new StringBuilder();
        content.Append("Record A:\n").Append(subjectContent).Append("\n\nRecord B:\n").Append(candidateContent);

        var request = new LlmRequest(
            RationaleSystemPrompt, new[] { new LlmMessage("user", content.ToString()) });

        // Default provider (Claude) — the duplicate check does not expose a provider selector.
        var completion = await _providers.Get(null).CompleteAsync(request, MaxRationaleTokens, ct).ConfigureAwait(false);
        var rationale = completion.Text.Trim();
        return string.IsNullOrEmpty(rationale) ? "These records may describe the same request." : rationale;
    }

    /// <summary>Projects a record to the workspace content-field allowlist — the data-sensitivity floor. Only the
    /// permitted non-PII fields are ever read; client / matter numbers and identities are never touched. Mirrors the
    /// same projection in <c>AskService</c> (kept inline rather than shared to avoid a cross-module abstraction).</summary>
    private static string BuildAllowlistedContent(RequestDto record, IReadOnlyList<string> allowlist)
    {
        var content = new StringBuilder();
        if (allowlist.Contains("Name") && !string.IsNullOrWhiteSpace(record.Name))
        {
            content.Append("Name: ").Append(record.Name).Append('\n');
        }

        if (allowlist.Contains("Description") && !string.IsNullOrWhiteSpace(record.Description))
        {
            content.Append("Description: ").Append(record.Description).Append('\n');
        }

        if (allowlist.Contains("WorkflowDetails"))
        {
            var workflowDetails = record.Fields.TryGetValue("workflowDetails", out var value)
                && value.ValueKind == JsonValueKind.String
                ? value.GetString()
                : null;
            if (!string.IsNullOrWhiteSpace(workflowDetails))
            {
                content.Append("Workflow Details: ").Append(workflowDetails);
            }
        }

        return content.ToString().Trim();
    }
}
