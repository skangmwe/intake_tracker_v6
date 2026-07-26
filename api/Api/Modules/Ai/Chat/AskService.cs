using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using McDermott.AiTracker.Api.Modules.Ai.Config;
using McDermott.AiTracker.Api.Modules.Ai.Providers;
using McDermott.AiTracker.Api.Modules.Ai.Retrieval;
using McDermott.AiTracker.Api.Modules.Requests;

namespace McDermott.AiTracker.Api.Modules.Ai.Chat;

/// <summary>
/// The Ask orchestrator. Enforces the §14 guardrails in code: default-OFF (the config gate), permission-respecting
/// (the conversation ownership gate + retrieval's WorkspaceMembership boundary + a per-record GetByIdAsync re-check),
/// transparent (grounded prompt + citation events), and off the critical path (no write path over records). The
/// data-sensitivity floor is enforced by <see cref="BuildAllowlistedContent"/> — only the workspace's allowlisted
/// content fields (Name / Description / Workflow Details) ever reach a provider. Prompts, responses, and record
/// content are never logged (api-pii-handling.md / api-logging.md).
/// </summary>
public sealed class AskService : IAskService
{
    // Grounded-answer retrieval breadth. Starts from the SimilarTopDefault family (3, the inline similar-requests
    // nudge) and is widened to 5: a cited answer benefits from a slightly larger candidate set than a nudge, and
    // intake records are short, so 5 improves recall while keeping the cited-source list scannable.
    private const int RetrievalTopK = 5;

    private static readonly JsonSerializerOptions JsonWeb = new(JsonSerializerDefaults.Web);

    private readonly IAiConfigService _config;
    private readonly IEmbeddingService _embeddings;
    private readonly IRecordRetriever _retriever;
    private readonly IRequestsService _requests;
    private readonly IAiConversationStore _store;
    private readonly ILlmProviderFactory _providers;
    private readonly ILogger<AskService> _logger;

    public AskService(
        IAiConfigService config,
        IEmbeddingService embeddings,
        IRecordRetriever retriever,
        IRequestsService requests,
        IAiConversationStore store,
        ILlmProviderFactory providers,
        ILogger<AskService> logger)
    {
        _config = config;
        _embeddings = embeddings;
        _retriever = retriever;
        _requests = requests;
        _store = store;
        _providers = providers;
        _logger = logger;
    }

    public async IAsyncEnumerable<AskEvent> AskAsync(
        Guid workspaceId,
        Guid userId,
        Guid conversationId,
        string query,
        string? provider,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        // ── Setup: gates + grounding. yield can't live in a catch, so capture any setup error and emit it after. ──
        Prep? prep = null;
        string? setupError = null;
        try
        {
            prep = await PrepareAsync(workspaceId, userId, conversationId, query, provider, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (KeyNotFoundException)
        {
            // Foreign / missing conversation — never disclose; surface an honest error.
            setupError = "This conversation could not be found.";
        }

        if (setupError is not null)
        {
            yield return ErrorEvent(setupError);
            yield break;
        }

        if (prep is null || !prep.Enabled)
        {
            yield return ErrorEvent("AI assist is turned off for this workspace. Ask a workspace admin to enable it.");
            yield break;
        }

        // ── Stream: yield tokens, and citation events as [cite:N] markers complete. Persist on success only. ──
        var stopwatch = Stopwatch.StartNew();
        var buffer = new StringBuilder();
        var emittedMarkers = new HashSet<int>();
        var streamFailed = false;

        var providerImpl = _providers.Get(prep.ProviderName);
        var enumerator = providerImpl.StreamAsync(prep.Request, cancellationToken).GetAsyncEnumerator(cancellationToken);
        try
        {
            while (true)
            {
                bool moved;
                try
                {
                    moved = await enumerator.MoveNextAsync().ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    throw;
                }
                catch
                {
                    // No mid-stream retry — emit one error event and close (api-streaming.md).
                    streamFailed = true;
                    break;
                }

                if (!moved)
                {
                    break;
                }

                var text = enumerator.Current.Text;
                buffer.Append(text);
                yield return TokenEvent(text);

                foreach (var cited in CitationParser.Extract(buffer.ToString(), prep.Sources))
                {
                    if (emittedMarkers.Add(cited.Marker))
                    {
                        yield return CitationEvent(cited);
                    }
                }
            }
        }
        finally
        {
            await enumerator.DisposeAsync().ConfigureAwait(false);
        }

        if (streamFailed)
        {
            _logger.LogWarning(
                "Ask stream interrupted for workspace {WorkspaceId} after {DurationMs}ms.", workspaceId, stopwatch.ElapsedMilliseconds);
            yield return ErrorEvent("The answer was interrupted before it finished. Try again.");
            yield break;
        }

        var citations = CitationParser.Extract(buffer.ToString(), prep.Sources);
        var citationsJson = citations.Count > 0 ? JsonSerializer.Serialize(
            citations.Select(citation => new { citation.Marker, citation.RecordId, citation.Title }), JsonWeb) : null;

        await _store.AppendAsync(conversationId, userId, "user", query, null, cancellationToken).ConfigureAwait(false);
        var assistantMessageId = await _store
            .AppendAsync(conversationId, userId, "assistant", buffer.ToString(), citationsJson, cancellationToken)
            .ConfigureAwait(false);

        _logger.LogInformation(
            "Ask answered for workspace {WorkspaceId}: {SourceCount} sources, {CitationCount} cited, {DurationMs}ms.",
            workspaceId, prep.Sources.Count, citations.Count, stopwatch.ElapsedMilliseconds);

        // Completion event carrying the persisted assistant message id, so the client can wire thumbs feedback.
        yield return new AskEvent("done", JsonSerializer.Serialize(new { messageId = assistantMessageId }, JsonWeb));
    }

    private async Task<Prep> PrepareAsync(
        Guid workspaceId, Guid userId, Guid conversationId, string query, string? provider, CancellationToken cancellationToken)
    {
        var config = await _config.GetAsync(workspaceId, cancellationToken).ConfigureAwait(false);
        if (!config.Enabled)
        {
            return Prep.Disabled;
        }

        // Ownership gate before any model work — throws KeyNotFoundException for a conversation the caller does not own.
        var history = await _store.LoadAsync(conversationId, userId, cancellationToken).ConfigureAwait(false);

        var queryEmbedding = await _embeddings.EmbedAsync(query, cancellationToken).ConfigureAwait(false);
        var retrieved = await _retriever
            .RetrieveAsync(workspaceId, userId, query, queryEmbedding, RetrievalTopK, cancellationToken)
            .ConfigureAwait(false);

        var sources = new List<RetrievedContent>(retrieved.Count);
        foreach (var match in retrieved)
        {
            // Re-check permission on the exact record and read only its allowlisted content.
            var record = await _requests.GetByIdAsync(match.RecordId, userId, cancellationToken).ConfigureAwait(false);
            if (record is null)
            {
                continue;
            }

            sources.Add(new RetrievedContent(
                record.Id, record.Name, BuildAllowlistedContent(record, config.ContentFieldAllowlist)));
        }

        var (request, grounded) = GroundedPromptBuilder.Build(query, sources, history);
        return new Prep(true, request, grounded, provider);
    }

    /// <summary>Projects a record to the workspace content-field allowlist — the data-sensitivity floor. Only the
    /// three permitted non-PII fields are ever read; client / matter numbers and identities are never touched.</summary>
    private static string BuildAllowlistedContent(RequestDto record, IReadOnlyList<string> allowlist)
    {
        var content = new StringBuilder();
        if (allowlist.Contains("Name"))
        {
            content.Append("Name: ").Append(record.Name).Append('\n');
        }

        if (allowlist.Contains("Description"))
        {
            content.Append("Description: ").Append(record.Description).Append('\n');
        }

        if (allowlist.Contains("WorkflowDetails"))
        {
            var workflowDetails = record.Fields.TryGetValue("workflowDetails", out var value)
                && value.ValueKind == JsonValueKind.String
                ? value.GetString()
                : null;
            content.Append("Workflow Details: ").Append(workflowDetails ?? string.Empty);
        }

        return content.ToString().Trim();
    }

    private static AskEvent TokenEvent(string text) =>
        new("token", JsonSerializer.Serialize(new { text }, JsonWeb));

    private static AskEvent CitationEvent(GroundedSource source) =>
        new("citation", JsonSerializer.Serialize(new { source.Marker, source.RecordId, source.Title }, JsonWeb));

    private static AskEvent ErrorEvent(string message) =>
        new("error", JsonSerializer.Serialize(new { message }, JsonWeb));

    private sealed record Prep(bool Enabled, LlmRequest Request, IReadOnlyList<GroundedSource> Sources, string? ProviderName)
    {
        public static readonly Prep Disabled = new(false, new LlmRequest(string.Empty, Array.Empty<LlmMessage>()), Array.Empty<GroundedSource>(), null);
    }
}
