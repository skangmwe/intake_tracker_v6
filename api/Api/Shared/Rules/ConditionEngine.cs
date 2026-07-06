// Condition-engine evaluator (BS §3.1). Responsibilities:
//   1. Evaluate a single rule's condition against a field-value map (show/hide/require/
//      produce-value share the same condition form) — consumed at form-render time (slice 5+).
//   2. Validate a workspace's field-rule dependency graph at save: it must be acyclic and no
//      deeper than three levels (§3.1). The Fields module runs ValidateGraph before persisting
//      a field change.
//   3. (Slice 21, §3.1) Resolve the current-date reference: a rule's CompareValue of @today /
//      @now / @currentDate resolves to today's date, and relational/equality comparators are
//      date-aware, so a rule can compare a date field against the current date.
//   4. (Slice 21, §3.3) Expose the date-difference primitive — whole days between two dates (or a
//      date and current-date) — the numeric substrate a Calculation field uses to stay numeric-only.
//
// Current date comes from IClock (never DateTime.UtcNow directly), so the engine is deterministic
// under test.

using System.Globalization;
using McDermott.AiTracker.Api.Shared.Time;

namespace McDermott.AiTracker.Api.Shared.Rules;

/// <summary>A single condition-engine rule (mirrors the FieldRule persistence shape).</summary>
public sealed record ConditionRule(
    string Action,
    string WhenFieldKey,
    string Comparator,
    string? CompareValue,
    string? ProduceValue,
    int SortOrder);

/// <summary>Outcome of the acyclic + depth-limit graph check (§3.1).</summary>
public sealed record GraphValidationResult(
    bool IsValid,
    int MaxDepth,
    IReadOnlyList<string>? CyclePath,
    IReadOnlyList<string> Errors);

public interface IConditionEngine
{
    /// <summary>Evaluates a rule's condition against the supplied field values. Returns true when the condition holds.</summary>
    bool Evaluate(ConditionRule rule, IReadOnlyDictionary<string, object?> fieldValues);

    /// <summary>Validates the dependency edges (from → to) are acyclic and no deeper than three levels.</summary>
    GraphValidationResult ValidateGraph(IEnumerable<(string From, string To)> edges);

    /// <summary>The current-date reference (§3.1) — today's date in UTC, from the injected clock.</summary>
    DateOnly Today();

    /// <summary>
    /// The date-difference primitive (§3.3): whole days from <paramref name="from"/> to <paramref name="to"/>
    /// (positive when <paramref name="to"/> is later). Either side may be an ISO date string or the
    /// current-date token (@today / @now / @currentDate). Returns null when either side is not a date.
    /// </summary>
    int? DateDifferenceDays(string? from, string? to);
}

public sealed class ConditionEngine : IConditionEngine
{
    // §3.1 — the dependency chain may build on another derived field but never deeper than three levels.
    public const int MaxDependencyDepth = 3;

    private readonly IClock _clock;

    public ConditionEngine(IClock clock)
    {
        _clock = clock;
    }

    public DateOnly Today() => DateOnly.FromDateTime(_clock.UtcNow.UtcDateTime);

    public int? DateDifferenceDays(string? from, string? to)
    {
        if (TryParseDate(ResolveDateToken(from), out var fromDate)
            && TryParseDate(ResolveDateToken(to), out var toDate))
        {
            return toDate.DayNumber - fromDate.DayNumber;
        }

        return null;
    }

    public bool Evaluate(ConditionRule rule, IReadOnlyDictionary<string, object?> fieldValues)
    {
        fieldValues.TryGetValue(rule.WhenFieldKey, out var raw);
        var actual = Normalise(raw);
        // §3.1 — @today / @now / @currentDate on the compare side resolve to the current date.
        var expected = ResolveDateToken(rule.CompareValue);

        return rule.Comparator switch
        {
            "isSet" => !string.IsNullOrWhiteSpace(actual),
            "isNotSet" => string.IsNullOrWhiteSpace(actual),
            "eq" => ValuesEqual(actual, expected),
            "neq" => !ValuesEqual(actual, expected),
            "contains" => actual is not null && expected is not null
                          && actual.Contains(expected, StringComparison.OrdinalIgnoreCase),
            "gt" => Compare(actual, expected) is int gt && gt > 0,
            "gte" => Compare(actual, expected) is int gte && gte >= 0,
            "lt" => Compare(actual, expected) is int lt && lt < 0,
            "lte" => Compare(actual, expected) is int lte && lte <= 0,
            _ => false,
        };
    }

    public GraphValidationResult ValidateGraph(IEnumerable<(string From, string To)> edges)
    {
        // Build adjacency (From depends on To).
        var adjacency = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var (from, to) in edges)
        {
            if (!adjacency.TryGetValue(from, out var targets))
            {
                targets = new List<string>();
                adjacency[from] = targets;
            }

            if (!targets.Contains(to, StringComparer.OrdinalIgnoreCase))
            {
                targets.Add(to);
            }
        }

        var errors = new List<string>();
        var cyclePath = DetectCycle(adjacency);
        if (cyclePath is not null)
        {
            errors.Add($"The field rules form a cycle: {string.Join(" → ", cyclePath)}.");
            return new GraphValidationResult(false, 0, cyclePath, errors);
        }

        var maxDepth = LongestPath(adjacency);
        if (maxDepth > MaxDependencyDepth)
        {
            errors.Add($"A field rule chain is {maxDepth} levels deep; the limit is {MaxDependencyDepth}.");
            return new GraphValidationResult(false, maxDepth, null, errors);
        }

        return new GraphValidationResult(true, maxDepth, null, errors);
    }

    // ─── condition helpers ──────────────────────────────────────────────
    private static string? Normalise(object? raw) => raw switch
    {
        null => null,
        bool boolean => boolean ? "true" : "false",
        IFormattable formattable => formattable.ToString(null, CultureInfo.InvariantCulture),
        _ => raw.ToString(),
    };

    private static bool ValuesEqual(string? actual, string? expected)
    {
        if (actual is null || expected is null)
        {
            return actual is null && expected is null;
        }

        if (TryParse(actual, out var actualNumber) && TryParse(expected, out var expectedNumber))
        {
            return actualNumber == expectedNumber;
        }

        if (TryParseDate(actual, out var actualDate) && TryParseDate(expected, out var expectedDate))
        {
            return actualDate == expectedDate;
        }

        return string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Ordering of two operands — numeric first, then date (§3.1 current-date comparisons), else
    /// incomparable (null), so a relational comparator on non-numeric/non-date operands fails closed.
    /// </summary>
    private static int? Compare(string? actual, string? expected)
    {
        if (TryParse(actual, out var actualNumber) && TryParse(expected, out var expectedNumber))
        {
            return actualNumber.CompareTo(expectedNumber);
        }

        if (TryParseDate(actual, out var actualDate) && TryParseDate(expected, out var expectedDate))
        {
            return actualDate.CompareTo(expectedDate);
        }

        return null;
    }

    private static bool TryParse(string? value, out decimal number) =>
        decimal.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out number);

    private static bool TryParseDate(string? value, out DateOnly date) =>
        DateOnly.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out date);

    /// <summary>Resolves the current-date token (@today / @now / @currentDate) to an ISO date; passes other values through.</summary>
    private string? ResolveDateToken(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return value;
        }

        return value.Trim().ToLowerInvariant() switch
        {
            "@today" or "@now" or "@currentdate" => Today().ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            _ => value,
        };
    }

    // ─── graph helpers ──────────────────────────────────────────────────
    private static List<string>? DetectCycle(Dictionary<string, List<string>> adjacency)
    {
        var visiting = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var stack = new List<string>();

        foreach (var node in adjacency.Keys)
        {
            var cycle = Walk(node, adjacency, visiting, visited, stack);
            if (cycle is not null)
            {
                return cycle;
            }
        }

        return null;
    }

    private static List<string>? Walk(
        string node,
        Dictionary<string, List<string>> adjacency,
        HashSet<string> visiting,
        HashSet<string> visited,
        List<string> stack)
    {
        if (visited.Contains(node))
        {
            return null;
        }

        visiting.Add(node);
        stack.Add(node);

        if (adjacency.TryGetValue(node, out var targets))
        {
            foreach (var target in targets)
            {
                if (visiting.Contains(target))
                {
                    var cycleStart = stack.FindIndex(entry => string.Equals(entry, target, StringComparison.OrdinalIgnoreCase));
                    var cycle = stack.Skip(cycleStart).ToList();
                    cycle.Add(target);
                    return cycle;
                }

                var nested = Walk(target, adjacency, visiting, visited, stack);
                if (nested is not null)
                {
                    return nested;
                }
            }
        }

        visiting.Remove(node);
        visited.Add(node);
        stack.RemoveAt(stack.Count - 1);
        return null;
    }

    // Longest path (in edges) over the DAG — only called after cycle detection passes.
    private static int LongestPath(Dictionary<string, List<string>> adjacency)
    {
        var memo = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var longest = 0;
        foreach (var node in adjacency.Keys)
        {
            longest = Math.Max(longest, DepthFrom(node, adjacency, memo));
        }

        return longest;
    }

    private static int DepthFrom(string node, Dictionary<string, List<string>> adjacency, Dictionary<string, int> memo)
    {
        if (memo.TryGetValue(node, out var cached))
        {
            return cached;
        }

        var best = 0;
        if (adjacency.TryGetValue(node, out var targets))
        {
            foreach (var target in targets)
            {
                best = Math.Max(best, 1 + DepthFrom(target, adjacency, memo));
            }
        }

        memo[node] = best;
        return best;
    }
}
