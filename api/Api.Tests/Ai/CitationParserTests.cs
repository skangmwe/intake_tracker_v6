using McDermott.AiTracker.Api.Modules.Ai.Chat;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public class CitationParserTests
{
    private static readonly IReadOnlyList<GroundedSource> TwoSources = new List<GroundedSource>
    {
        new(1, "LIT-9004", "Retention policy helper"),
        new(2, "LIT-9010", "Contract clause finder"),
    };

    [Fact]
    public void Extract_KeepsValidMarkers_DiscardsUnknown()
    {
        // Act - marker 1 is real; marker 9 is a hallucination with no matching source.
        var cited = CitationParser.Extract("Retention is handled here [cite:1]. Also [cite:9].", TwoSources);

        // Assert - only the real, matched source survives.
        Assert.Single(cited);
        Assert.Equal(1, cited[0].Marker);
        Assert.Equal("LIT-9004", cited[0].RecordId);
    }

    [Fact]
    public void Extract_NoMarkers_ReturnsEmpty()
    {
        // Act - an honest "no records" answer carries no citations.
        var cited = CitationParser.Extract("I don't have records on that.", TwoSources);

        // Assert
        Assert.Empty(cited);
    }

    [Fact]
    public void Extract_DeduplicatesRepeatedMarker()
    {
        // Act - the same marker cited twice is one source.
        var cited = CitationParser.Extract("See [cite:2] and again [cite:2].", TwoSources);

        // Assert
        Assert.Single(cited);
        Assert.Equal(2, cited[0].Marker);
    }

    [Fact]
    public void Extract_PreservesSourceOrderByMarker()
    {
        // Act - cited out of order.
        var cited = CitationParser.Extract("First [cite:2], then [cite:1].", TwoSources);

        // Assert - returned in marker order for a stable source list.
        Assert.Equal(2, cited.Count);
        Assert.Equal(1, cited[0].Marker);
        Assert.Equal(2, cited[1].Marker);
    }
}
