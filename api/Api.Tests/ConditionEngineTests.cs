// Unit tests for the ConditionEngine (BS §3.1) — the pure condition evaluation and the
// acyclic + depth<=3 graph validation. No I/O, so these run as fast unit tests.

using McDermott.AiTracker.Api.Shared.Rules;
using McDermott.AiTracker.Api.Shared.Time;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class ConditionEngineTests
{
    // Fixed "today" = 2026-07-06 so current-date evaluation is deterministic.
    private readonly Mock<IClock> _clock = new();
    private readonly ConditionEngine _sut;

    public ConditionEngineTests()
    {
        _clock.SetupGet(clock => clock.UtcNow).Returns(new DateTimeOffset(2026, 7, 6, 9, 0, 0, TimeSpan.Zero));
        _sut = new ConditionEngine(_clock.Object);
    }

    private static ConditionRule Rule(string comparator, string? compareValue) =>
        new("Show", "deptPgClient", comparator, compareValue, ProduceValue: null, SortOrder: 1);

    [Fact]
    public void Evaluate_EqMatches_ReturnsTrue()
    {
        // Arrange
        var values = new Dictionary<string, object?> { ["deptPgClient"] = "Client" };

        // Act
        var result = _sut.Evaluate(Rule("eq", "Client"), values);

        // Assert
        Assert.True(result);
    }

    [Fact]
    public void Evaluate_EqDoesNotMatch_ReturnsFalse()
    {
        var values = new Dictionary<string, object?> { ["deptPgClient"] = "Dept" };
        Assert.False(_sut.Evaluate(Rule("eq", "Client"), values));
    }

    [Fact]
    public void Evaluate_IsSetOnBooleanTrue_ReturnsTrue()
    {
        // Arrange — a boolean value normalises to "true".
        var values = new Dictionary<string, object?> { ["deptPgClient"] = true };

        // Act
        var result = _sut.Evaluate(new ConditionRule("Show", "deptPgClient", "isSet", null, null, 1), values);

        // Assert
        Assert.True(result);
    }

    [Fact]
    public void Evaluate_IsSetOnMissingValue_ReturnsFalse()
    {
        var values = new Dictionary<string, object?>();
        Assert.False(_sut.Evaluate(new ConditionRule("Require", "clientNumber", "isSet", null, null, 1), values));
    }

    [Fact]
    public void Evaluate_NumericGreaterThan_ReturnsTrue()
    {
        var values = new Dictionary<string, object?> { ["businessValue"] = 5 };
        var rule = new ConditionRule("Show", "businessValue", "gt", "3", null, 1);
        Assert.True(_sut.Evaluate(rule, values));
    }

    [Fact]
    public void Evaluate_NonNumericRelational_ReturnsFalse()
    {
        // Arrange — a relational comparator over non-numeric operands never matches.
        var values = new Dictionary<string, object?> { ["name"] = "abc" };
        var rule = new ConditionRule("Show", "name", "lt", "xyz", null, 1);

        // Act + Assert
        Assert.False(_sut.Evaluate(rule, values));
    }

    [Fact]
    public void Evaluate_ContainsMatch_ReturnsTrue()
    {
        var values = new Dictionary<string, object?> { ["complianceFlags"] = "HIPAA,GDPR" };
        var rule = new ConditionRule("Show", "complianceFlags", "contains", "GDPR", null, 1);
        Assert.True(_sut.Evaluate(rule, values));
    }

    [Fact]
    public void ValidateGraph_AcyclicWithinDepth_IsValid()
    {
        // Arrange — priorityScore → businessValue (depth 1).
        var edges = new[] { ("priorityScore", "businessValue"), ("priorityScore", "efficiencyGain") };

        // Act
        var result = _sut.ValidateGraph(edges);

        // Assert
        Assert.True(result.IsValid);
        Assert.Equal(1, result.MaxDepth);
    }

    [Fact]
    public void ValidateGraph_Cycle_IsInvalidWithPath()
    {
        // Arrange — a → b → a.
        var edges = new[] { ("a", "b"), ("b", "a") };

        // Act
        var result = _sut.ValidateGraph(edges);

        // Assert
        Assert.False(result.IsValid);
        Assert.NotNull(result.CyclePath);
    }

    [Fact]
    public void ValidateGraph_ExceedsDepthLimit_IsInvalid()
    {
        // Arrange — a → b → c → d → e is four edges deep (limit is three).
        var edges = new[] { ("a", "b"), ("b", "c"), ("c", "d"), ("d", "e") };

        // Act
        var result = _sut.ValidateGraph(edges);

        // Assert
        Assert.False(result.IsValid);
        Assert.True(result.MaxDepth > ConditionEngine.MaxDependencyDepth);
    }

    [Fact]
    public void ValidateGraph_AtDepthLimit_IsValid()
    {
        // Arrange — exactly three edges deep is allowed.
        var edges = new[] { ("a", "b"), ("b", "c"), ("c", "d") };

        // Act
        var result = _sut.ValidateGraph(edges);

        // Assert
        Assert.True(result.IsValid);
        Assert.Equal(ConditionEngine.MaxDependencyDepth, result.MaxDepth);
    }

    [Fact]
    public void ValidateGraph_NoEdges_IsValid()
    {
        var result = _sut.ValidateGraph(Array.Empty<(string, string)>());
        Assert.True(result.IsValid);
        Assert.Equal(0, result.MaxDepth);
    }

    // ─── Current-date reference (§3.1) ───────────────────────────────────────────

    [Fact]
    public void Today_ReturnsClockDate()
    {
        Assert.Equal(new DateOnly(2026, 7, 6), _sut.Today());
    }

    [Fact]
    public void Evaluate_DueDateBeforeToday_LtAgainstCurrentDateToken_ReturnsTrue()
    {
        // Arrange — a date field earlier than today is "less than" @today (overdue-style rule).
        var values = new Dictionary<string, object?> { ["dueDate"] = "2026-07-01" };
        var rule = new ConditionRule("Show", "dueDate", "lt", "@today", null, 1);

        // Act + Assert
        Assert.True(_sut.Evaluate(rule, values));
    }

    [Fact]
    public void Evaluate_DueDateAfterToday_LtAgainstCurrentDateToken_ReturnsFalse()
    {
        var values = new Dictionary<string, object?> { ["dueDate"] = "2026-07-10" };
        var rule = new ConditionRule("Show", "dueDate", "lt", "@now", null, 1);
        Assert.False(_sut.Evaluate(rule, values));
    }

    [Fact]
    public void Evaluate_DueDateEqualsToday_EqAgainstCurrentDateToken_ReturnsTrue()
    {
        var values = new Dictionary<string, object?> { ["dueDate"] = "2026-07-06" };
        var rule = new ConditionRule("Show", "dueDate", "eq", "@currentDate", null, 1);
        Assert.True(_sut.Evaluate(rule, values));
    }

    // ─── Date-difference primitive (§3.3) ────────────────────────────────────────

    [Fact]
    public void DateDifferenceDays_TwoLiteralDates_ReturnsWholeDays()
    {
        Assert.Equal(5, _sut.DateDifferenceDays("2026-07-01", "2026-07-06"));
    }

    [Fact]
    public void DateDifferenceDays_NegativeWhenToIsEarlier_ReturnsSignedDays()
    {
        Assert.Equal(-3, _sut.DateDifferenceDays("2026-07-06", "2026-07-03"));
    }

    [Fact]
    public void DateDifferenceDays_FromDateToCurrentDateToken_MeasuresAgainstClock()
    {
        // 2026-07-01 → today (2026-07-06) is 5 days.
        Assert.Equal(5, _sut.DateDifferenceDays("2026-07-01", "@today"));
    }

    [Fact]
    public void DateDifferenceDays_NonDateOperand_ReturnsNull()
    {
        Assert.Null(_sut.DateDifferenceDays("not-a-date", "2026-07-06"));
    }
}
