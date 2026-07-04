// Condition-engine evaluator (BS §3.1). Two responsibilities:
//   1. Evaluate a single rule's condition against a field-value map (show/hide/require/
//      produce-value share the same condition form) — consumed at form-render time (slice 5+).
//   2. Validate a workspace's field-rule dependency graph at save: it must be acyclic and no
//      deeper than three levels (§3.1). The Fields module runs ValidateGraph before persisting
//      a field change.
//
// Phase 1 compares a field value against a literal only; the current-date / current-user
// references (§3.1) are Phase 2 and are not implemented here.

using System.Globalization;

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
}

public sealed class ConditionEngine : IConditionEngine
{
    // §3.1 — the dependency chain may build on another derived field but never deeper than three levels.
    public const int MaxDependencyDepth = 3;

    public bool Evaluate(ConditionRule rule, IReadOnlyDictionary<string, object?> fieldValues)
    {
        fieldValues.TryGetValue(rule.WhenFieldKey, out var raw);
        var actual = Normalise(raw);
        var expected = rule.CompareValue;

        return rule.Comparator switch
        {
            "isSet" => !string.IsNullOrWhiteSpace(actual),
            "isNotSet" => string.IsNullOrWhiteSpace(actual),
            "eq" => ValuesEqual(actual, expected),
            "neq" => !ValuesEqual(actual, expected),
            "contains" => actual is not null && expected is not null
                          && actual.Contains(expected, StringComparison.OrdinalIgnoreCase),
            "gt" => CompareNumeric(actual, expected) > 0,
            "gte" => CompareNumeric(actual, expected) >= 0,
            "lt" => IsNumericComparable(actual, expected) && CompareNumeric(actual, expected) < 0,
            "lte" => IsNumericComparable(actual, expected) && CompareNumeric(actual, expected) <= 0,
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

        return string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsNumericComparable(string? actual, string? expected) =>
        TryParse(actual, out _) && TryParse(expected, out _);

    private static int CompareNumeric(string? actual, string? expected)
    {
        if (TryParse(actual, out var actualNumber) && TryParse(expected, out var expectedNumber))
        {
            return actualNumber.CompareTo(expectedNumber);
        }

        // Non-numeric operands never satisfy a relational comparator.
        return -1;
    }

    private static bool TryParse(string? value, out decimal number) =>
        decimal.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out number);

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
