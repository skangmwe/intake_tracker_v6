// Pure validation for an Authored Request trigger upsert (slice: triggers-request-authoring, Task 2.1).
// Extracted from TriggersService so the business rules can be unit-tested without a database. Returns the
// list of human-readable errors (empty = valid); the service turns a non-empty list into a 400.

namespace McDermott.AiTracker.Api.Modules.Triggers;

public static class TriggerRequestValidator
{
    public const string CadenceOnce = "Once";
    public const string CadenceRepeat = "RepeatEveryNDays";

    // The comparators the ConditionEngine understands (ConditionEngine.cs).
    private static readonly HashSet<string> AllowedComparators = new(StringComparer.Ordinal)
    {
        "isSet", "isNotSet", "eq", "neq", "contains", "gt", "gte", "lt", "lte",
    };

    // The comparators that take no value.
    private static readonly HashSet<string> ValuelessComparators = new(StringComparer.Ordinal) { "isSet", "isNotSet" };

    // The user-reference field keys a Request trigger may notify (the authoring UI offers exactly these).
    private static readonly HashSet<string> AllowedRecipientKeys = new(StringComparer.Ordinal)
    {
        "assignedAnalyst", "businessOwner", "requestor", "watchers",
    };

    // Authored Request triggers fire under one of these categories.
    private static readonly HashSet<string> AllowedCategories = new(StringComparer.Ordinal) { "sla-reminder", "benefit-review" };

    public static IReadOnlyList<string> Validate(TriggerUpsertRequest request)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            errors.Add("Name is required.");
        }

        if (string.IsNullOrWhiteSpace(request.NotificationTitle))
        {
            errors.Add("A notification title is required.");
        }

        if (!string.Equals(request.Cadence, CadenceOnce, StringComparison.Ordinal)
            && !string.Equals(request.Cadence, CadenceRepeat, StringComparison.Ordinal))
        {
            errors.Add("Cadence must be Once or RepeatEveryNDays.");
        }
        else if (string.Equals(request.Cadence, CadenceRepeat, StringComparison.Ordinal)
                 && (request.RepeatIntervalDays is null || request.RepeatIntervalDays < 1))
        {
            errors.Add("A repeat cadence needs an interval of at least one day.");
        }

        if (!AllowedCategories.Contains(request.NotificationCategory))
        {
            errors.Add("The notification category must be sla-reminder or benefit-review.");
        }

        if (request.Recipients is null || request.Recipients.Count == 0)
        {
            errors.Add("Choose at least one recipient.");
        }
        else if (request.Recipients.Any(key => !AllowedRecipientKeys.Contains(key)))
        {
            errors.Add("Recipients must be Assigned analyst, Business owner, Requestor, or Watchers.");
        }

        if (request.Conditions is null || request.Conditions.Count == 0)
        {
            errors.Add("Add at least one condition.");
        }
        else
        {
            foreach (var condition in request.Conditions)
            {
                if (string.IsNullOrWhiteSpace(condition.WhenFieldKey))
                {
                    errors.Add("Each condition needs a field.");
                }

                if (!AllowedComparators.Contains(condition.Comparator))
                {
                    errors.Add($"'{condition.Comparator}' is not a valid comparator.");
                }
                else if (!ValuelessComparators.Contains(condition.Comparator) && string.IsNullOrWhiteSpace(condition.CompareValue))
                {
                    errors.Add("This comparator needs a value.");
                }
            }
        }

        return errors;
    }
}
