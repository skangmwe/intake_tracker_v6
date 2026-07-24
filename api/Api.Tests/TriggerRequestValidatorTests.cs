// Unit tests for TriggerRequestValidator (slice: triggers-request-authoring) — every validation branch of
// an Authored Request trigger upsert. Pure logic, no database.

using McDermott.AiTracker.Api.Modules.Triggers;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class TriggerRequestValidatorTests
{
    private static TriggerUpsertRequest Valid(
        string name = "Overdue",
        string cadence = "RepeatEveryNDays",
        int? interval = 1,
        string category = "sla-reminder",
        string title = "A request is overdue",
        string[]? recipients = null,
        TriggerConditionDto[]? conditions = null) => new(
            name,
            IsEnabled: true,
            cadence,
            interval,
            category,
            recipients ?? new[] { "assignedAnalyst" },
            title,
            NotificationBody: string.Empty,
            conditions ?? new[] { new TriggerConditionDto("dueDate", "lt", "@today") });

    [Fact]
    public void Validate_ValidRequest_NoErrors()
    {
        Assert.Empty(TriggerRequestValidator.Validate(Valid()));
    }

    [Fact]
    public void Validate_EmptyName_Errors()
    {
        Assert.NotEmpty(TriggerRequestValidator.Validate(Valid(name: "  ")));
    }

    [Fact]
    public void Validate_EmptyTitle_Errors()
    {
        Assert.NotEmpty(TriggerRequestValidator.Validate(Valid(title: "")));
    }

    [Fact]
    public void Validate_UnknownCadence_Errors()
    {
        Assert.NotEmpty(TriggerRequestValidator.Validate(Valid(cadence: "Hourly")));
    }

    [Theory]
    [InlineData(null)]
    [InlineData(0)]
    public void Validate_RepeatCadenceWithoutValidInterval_Errors(int? interval)
    {
        Assert.NotEmpty(TriggerRequestValidator.Validate(Valid(cadence: "RepeatEveryNDays", interval: interval)));
    }

    [Fact]
    public void Validate_OnceCadenceIgnoresInterval_NoError()
    {
        // Once with a null interval is valid (the interval only matters for RepeatEveryNDays).
        Assert.Empty(TriggerRequestValidator.Validate(Valid(cadence: "Once", interval: null)));
    }

    [Fact]
    public void Validate_UnknownCategory_Errors()
    {
        Assert.NotEmpty(TriggerRequestValidator.Validate(Valid(category: "task-overdue")));
    }

    [Fact]
    public void Validate_NoRecipients_Errors()
    {
        Assert.NotEmpty(TriggerRequestValidator.Validate(Valid(recipients: Array.Empty<string>())));
    }

    [Fact]
    public void Validate_UnknownRecipientKey_Errors()
    {
        Assert.NotEmpty(TriggerRequestValidator.Validate(Valid(recipients: new[] { "randomField" })));
    }

    [Fact]
    public void Validate_NoConditions_Errors()
    {
        Assert.NotEmpty(TriggerRequestValidator.Validate(Valid(conditions: Array.Empty<TriggerConditionDto>())));
    }

    [Fact]
    public void Validate_ConditionWithEmptyFieldKey_Errors()
    {
        Assert.NotEmpty(TriggerRequestValidator.Validate(Valid(conditions: new[] { new TriggerConditionDto("", "lt", "@today") })));
    }

    [Fact]
    public void Validate_ConditionWithInvalidComparator_Errors()
    {
        Assert.NotEmpty(TriggerRequestValidator.Validate(Valid(conditions: new[] { new TriggerConditionDto("dueDate", "between", "x") })));
    }

    [Fact]
    public void Validate_ComparatorNeedingValueWithoutValue_Errors()
    {
        Assert.NotEmpty(TriggerRequestValidator.Validate(Valid(conditions: new[] { new TriggerConditionDto("dueDate", "lt", null) })));
    }

    [Fact]
    public void Validate_ValuelessComparatorWithoutValue_NoError()
    {
        // isSet / isNotSet take no value, so a null value is fine.
        Assert.Empty(TriggerRequestValidator.Validate(Valid(conditions: new[] { new TriggerConditionDto("dueDate", "isSet", null) })));
    }
}
