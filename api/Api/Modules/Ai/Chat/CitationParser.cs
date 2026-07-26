using System.Text.RegularExpressions;

namespace McDermott.AiTracker.Api.Modules.Ai.Chat;

/// <summary>
/// Extracts the <c>[cite:N]</c> markers the model actually emitted and resolves them to the numbered sources it was
/// given. Markers with no matching source are silently discarded — the hallucination guard that keeps a fabricated
/// citation from ever surfacing. Pure and deterministic. Returned in marker order for a stable source list.
/// </summary>
public static partial class CitationParser
{
    [GeneratedRegex(@"\[cite:(\d+)\]", RegexOptions.CultureInvariant)]
    private static partial Regex CiteMarker();

    public static IReadOnlyList<GroundedSource> Extract(string assistantText, IReadOnlyList<GroundedSource> sources)
    {
        if (string.IsNullOrEmpty(assistantText) || sources.Count == 0)
        {
            return Array.Empty<GroundedSource>();
        }

        var byMarker = sources.ToDictionary(source => source.Marker);
        var citedMarkers = new HashSet<int>();

        foreach (Match match in CiteMarker().Matches(assistantText))
        {
            if (int.TryParse(match.Groups[1].Value, out var marker) && byMarker.ContainsKey(marker))
            {
                citedMarkers.Add(marker);
            }
        }

        return citedMarkers
            .OrderBy(marker => marker)
            .Select(marker => byMarker[marker])
            .ToList();
    }
}
