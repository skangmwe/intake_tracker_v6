using System.Text;
using McDermott.AiTracker.Api.Modules.Ai.Providers;

namespace McDermott.AiTracker.Api.Modules.Ai.Chat;

/// <summary>A numbered source the answer may cite — the pairing of a [cite:N] marker to the record it names.
/// Title is Confidential — never logged.</summary>
public sealed record GroundedSource(int Marker, string RecordId, string Title);

/// <summary>The allowlisted content of one retrieved record, ready to ground the prompt. The caller has already
/// projected this to the workspace content-field allowlist — the builder never sees client/matter/identity data
/// (the data-sensitivity floor). Content is Confidential — never logged.</summary>
public sealed record RetrievedContent(string RecordId, string Title, string AllowlistedContent);

/// <summary>
/// Builds the grounded chat prompt: a system instruction that constrains the model to answer <b>only</b> from the
/// numbered records and cite every claim as <c>[cite:N]</c>, plus a user turn carrying the numbered sources and the
/// question. Pure and deterministic — no I/O, no logging. The four §14 guardrails live in the system text
/// (transparent + never-invent); the data-floor is upstream (only allowlisted content ever reaches here).
/// </summary>
public static class GroundedPromptBuilder
{
    /// <summary>History-trim budget: the last N prior turns are kept. Matches the conversation-history default of
    /// "last 50 messages" (api-conversation-history.md) — Ask threads are short, so the message cap alone suffices
    /// and no token counting is done here.</summary>
    public const int MaxHistoryMessages = 50;

    private const string SystemInstruction =
        "You are the McDermott Will & Schulte intake search assistant. Answer the user's question using ONLY the " +
        "numbered records supplied beneath the question. Cite every specific claim with an inline [cite:N] marker " +
        "naming the record it came from. If the records do not answer the question, say plainly that you do not " +
        "have records on that — never invent records, facts, dates, names, or details, and never cite a record " +
        "that is not listed. Do not produce legal conclusions or recommendations; present the information factually " +
        "and let the reader conclude.";

    public static (LlmRequest Request, IReadOnlyList<GroundedSource> Sources) Build(
        string userQuery,
        IReadOnlyList<RetrievedContent> sources,
        IReadOnlyList<AiMessage> history)
    {
        var grounded = new List<GroundedSource>(sources.Count);
        var sourcesBlock = new StringBuilder();
        sourcesBlock.Append("Records:\n");

        if (sources.Count == 0)
        {
            sourcesBlock.Append("(none found)\n");
        }
        else
        {
            for (var index = 0; index < sources.Count; index++)
            {
                var marker = index + 1;
                var source = sources[index];
                grounded.Add(new GroundedSource(marker, source.RecordId, source.Title));
                sourcesBlock
                    .Append('[').Append(marker).Append("] ").Append(source.Title)
                    .Append(" (").Append(source.RecordId).Append(")\n")
                    .Append(source.AllowlistedContent).Append("\n\n");
            }
        }

        var userContent = $"{sourcesBlock.ToString().TrimEnd()}\n\nQuestion: {userQuery}";

        var messages = new List<LlmMessage>(Math.Min(history.Count, MaxHistoryMessages) + 1);
        foreach (var message in TrimHistory(history))
        {
            messages.Add(new LlmMessage(message.Role, message.Content));
        }
        messages.Add(new LlmMessage("user", userContent));

        return (new LlmRequest(SystemInstruction, messages), grounded);
    }

    private static IEnumerable<AiMessage> TrimHistory(IReadOnlyList<AiMessage> history) =>
        history.Count <= MaxHistoryMessages
            ? history
            : history.Skip(history.Count - MaxHistoryMessages);
}
