using McDermott.AiTracker.Api.Modules.Ai.Chat;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public class GroundedPromptBuilderTests
{
    private static AiMessage UserTurn(string content) =>
        new(Guid.NewGuid(), "user", content, null, null, DateTime.UtcNow);

    [Fact]
    public void Build_NumbersSourcesAndIncludesOnlyProvidedContent()
    {
        // Arrange - two retrieved records; the "client number" text is NEVER passed in (data-floor).
        var sources = new List<RetrievedContent>
        {
            new("LIT-9004", "Retention policy helper", "Description: Summarise retention rules"),
            new("LIT-9010", "Contract clause finder", "Description: Locate indemnity clauses"),
        };

        // Act
        var (request, grounded) = GroundedPromptBuilder.Build("What handles retention?", sources, Array.Empty<AiMessage>());
        var lastUserMessage = request.Messages[^1].Content;

        // Assert - the prompt numbers both sources and carries their provided content, and only that content.
        Assert.Contains("[1]", lastUserMessage);
        Assert.Contains("[2]", lastUserMessage);
        Assert.Contains("Summarise retention rules", lastUserMessage);
        Assert.Contains("Locate indemnity clauses", lastUserMessage);
        Assert.DoesNotContain("MATTER-", lastUserMessage);
        Assert.Contains("What handles retention?", lastUserMessage);

        // And the returned source list maps markers 1..n to the record ids.
        Assert.Equal(2, grounded.Count);
        Assert.Equal(1, grounded[0].Marker);
        Assert.Equal("LIT-9004", grounded[0].RecordId);
        Assert.Equal(2, grounded[1].Marker);
    }

    [Fact]
    public void Build_SystemInstructsCiteAndNeverInvent()
    {
        // Act
        var (request, _) = GroundedPromptBuilder.Build(
            "q", new[] { new RetrievedContent("LIT-1", "T", "Description: x") }, Array.Empty<AiMessage>());

        // Assert - the system prompt carries the grounding contract.
        Assert.Contains("[cite:", request.System);
        Assert.Contains("only", request.System, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Build_NoSources_ReturnsEmptySourceListAndStillIncludesQuery()
    {
        // Act - retrieval found nothing.
        var (request, grounded) = GroundedPromptBuilder.Build(
            "anything about widgets?", Array.Empty<RetrievedContent>(), Array.Empty<AiMessage>());

        // Assert - no numbered sources, but the query is still asked (honest "no records" answer follows).
        Assert.Empty(grounded);
        Assert.Contains("anything about widgets?", request.Messages[^1].Content);
    }

    [Fact]
    public void Build_TrimsHistoryToBudget()
    {
        // Arrange - more prior turns than the history budget.
        var history = Enumerable.Range(0, GroundedPromptBuilder.MaxHistoryMessages + 10)
            .Select(index => UserTurn($"turn {index}"))
            .ToList();

        // Act
        var (request, _) = GroundedPromptBuilder.Build(
            "now", new[] { new RetrievedContent("LIT-1", "T", "Description: x") }, history);

        // Assert - trimmed to the last MaxHistoryMessages, plus the new grounded user turn.
        Assert.Equal(GroundedPromptBuilder.MaxHistoryMessages + 1, request.Messages.Count);
        // The oldest turns were dropped from the front.
        Assert.DoesNotContain(request.Messages, message => message.Content == "turn 0");
    }
}
