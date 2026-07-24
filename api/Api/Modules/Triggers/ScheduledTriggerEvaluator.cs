// The trigger evaluator (slice: triggers-engine-core, Task 1.4). Runs one daily sweep over the enabled
// 'Authored' triggers: for each, fetch candidate records + fire watermarks, evaluate the authored
// condition over each record's field-value map via the ConditionEngine, apply the fire-once/re-nag
// cadence, resolve recipients from the record's user-reference fields, and emit a `trigger.fired` event
// through the shared event spine (which fans out the in-app bell rows via usp_FanOutNotification and
// writes the audit row). A per-record failure is logged and skipped — one bad record never aborts the
// sweep (the same batch-continue semantics as AnnouncementSchedulerService). No PII is logged.
//
// Scoped: it holds a scoped gateway (AppDbContext). The BackgroundService resolves it in a fresh scope
// per sweep. Public and gateway-injected so the orchestration is unit-testable with Moq without a DB.

using System.Diagnostics;
using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Rules;
using McDermott.AiTracker.Api.Shared.Time;
using Serilog.Context;

namespace McDermott.AiTracker.Api.Modules.Triggers;

/// <summary>Counts from one sweep — logged (no PII) and recorded on the sweep-log row.</summary>
public sealed record SweepSummary(int Evaluated, int Fired, int FailedFanOut);

public interface IScheduledTriggerEvaluator
{
    /// <summary>Run one daily sweep for <paramref name="today"/>. Returns the evaluation counts.</summary>
    Task<SweepSummary> RunDailySweepAsync(DateOnly today, CancellationToken cancellationToken);
}

public sealed class ScheduledTriggerEvaluator : IScheduledTriggerEvaluator
{
    private const string WatchersRecipientKey = "watchers";
    private const string TriggerFiredEventType = "trigger.fired";

    private static readonly JsonSerializerOptions PayloadOptions =
        new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private readonly ITriggerGateway _gateway;
    private readonly IConditionEngine _conditionEngine;
    private readonly IEventSpine _eventSpine;
    private readonly IClock _clock;
    private readonly ILogger<ScheduledTriggerEvaluator> _logger;

    public ScheduledTriggerEvaluator(
        ITriggerGateway gateway,
        IConditionEngine conditionEngine,
        IEventSpine eventSpine,
        IClock clock,
        ILogger<ScheduledTriggerEvaluator> logger)
    {
        _gateway = gateway;
        _conditionEngine = conditionEngine;
        _eventSpine = eventSpine;
        _clock = clock;
        _logger = logger;
    }

    /// <summary>Run one daily sweep for <paramref name="today"/>. Returns the evaluation counts.</summary>
    public async Task<SweepSummary> RunDailySweepAsync(DateOnly today, CancellationToken cancellationToken)
    {
        // A per-sweep correlation id (no HTTP request here) so audit + logs join up (api-logging.md).
        var operationId = Guid.NewGuid().ToString();
        using (LogContext.PushProperty("OperationId", operationId))
        {
            var startedAt = Stopwatch.GetTimestamp();
            var triggers = await _gateway.GetEnabledAuthoredTriggersAsync(cancellationToken).ConfigureAwait(false);

            var evaluated = 0;
            var fired = 0;
            var failedFanOut = 0;

            foreach (var trigger in triggers)
            {
                cancellationToken.ThrowIfCancellationRequested();
                evaluated++;

                var conditions = ParseConditions(trigger.ConditionsJson);
                // An Authored trigger with no conditions would match every record — fail closed rather
                // than mass-notify (authoring validation enforces at least one condition in a later slice).
                if (conditions.Count == 0)
                {
                    continue;
                }

                var recipientKeys = ParseRecipientKeys(trigger.Recipients);
                var candidates = await _gateway.GetCandidatesAsync(trigger.TriggerId, cancellationToken).ConfigureAwait(false);
                var watermarks = (await _gateway.GetWatermarksAsync(trigger.TriggerId, cancellationToken).ConfigureAwait(false))
                    .ToDictionary(row => row.RecordId, row => DateOnly.FromDateTime(row.LastFiredDate), StringComparer.Ordinal);

                foreach (var candidate in candidates)
                {
                    cancellationToken.ThrowIfCancellationRequested();

                    var fieldValues = ParseFieldValues(candidate.FieldValuesJson);
                    if (!AllConditionsMatch(conditions, fieldValues))
                    {
                        continue;
                    }

                    if (!ShouldFire(trigger, watermarks, candidate.RecordId, today))
                    {
                        continue;
                    }

                    var (recipientUserIds, includeWatchers) = ResolveRecipients(recipientKeys, fieldValues);
                    if (recipientUserIds.Count == 0 && !includeWatchers)
                    {
                        // Nothing to notify — do not emit (and do not stamp a watermark, so a later
                        // population of the recipient field can still fire).
                        continue;
                    }

                    try
                    {
                        await EmitFiredAsync(trigger, candidate.RecordId, recipientUserIds, includeWatchers, operationId, cancellationToken)
                            .ConfigureAwait(false);
                        await _gateway.UpsertFireAsync(trigger.TriggerId, candidate.RecordId, today, cancellationToken).ConfigureAwait(false);
                        fired++;
                    }
                    catch (Exception exception) when (exception is not OperationCanceledException)
                    {
                        failedFanOut++;
                        _logger.LogError(exception,
                            "Trigger {TriggerId} could not fire for a record; skipping and continuing the sweep.",
                            trigger.TriggerId);
                    }
                }
            }

            var durationMs = Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds;
            _logger.LogInformation(
                "Trigger sweep evaluated {Evaluated} trigger(s), fired {Fired} reminder(s) ({FailedFanOut} failure(s)) in {DurationMs}ms.",
                evaluated, fired, failedFanOut, durationMs);

            return new SweepSummary(evaluated, fired, failedFanOut);
        }
    }

    // ─── cadence ────────────────────────────────────────────────────────
    private static bool ShouldFire(
        EnabledTriggerRow trigger, IReadOnlyDictionary<string, DateOnly> watermarks, string recordId, DateOnly today)
    {
        if (!watermarks.TryGetValue(recordId, out var lastFired))
        {
            return true; // never fired for this record
        }

        // 'Once' → a present watermark blocks any re-fire. 'RepeatEveryNDays' → re-fire once the interval elapsed.
        if (string.Equals(trigger.Cadence, "RepeatEveryNDays", StringComparison.Ordinal))
        {
            var interval = trigger.RepeatIntervalDays ?? 1;
            return lastFired.AddDays(interval) <= today;
        }

        return false;
    }

    // ─── condition evaluation ───────────────────────────────────────────
    private bool AllConditionsMatch(IReadOnlyList<ConditionRule> conditions, IReadOnlyDictionary<string, object?> fieldValues)
    {
        foreach (var condition in conditions)
        {
            if (!_conditionEngine.Evaluate(condition, fieldValues))
            {
                return false;
            }
        }

        return true;
    }

    // ─── recipient resolution ───────────────────────────────────────────
    private static (List<string> UserIds, bool IncludeWatchers) ResolveRecipients(
        IReadOnlyList<string> recipientKeys, IReadOnlyDictionary<string, object?> fieldValues)
    {
        var userIds = new List<string>();
        var includeWatchers = false;

        foreach (var key in recipientKeys)
        {
            if (string.Equals(key, WatchersRecipientKey, StringComparison.OrdinalIgnoreCase))
            {
                includeWatchers = true;
                continue;
            }

            // A single-valued user-reference field holds the user's id. Only accept GUID-shaped values.
            if (fieldValues.TryGetValue(key, out var raw)
                && raw is string candidate
                && Guid.TryParse(candidate, out _)
                && !userIds.Contains(candidate, StringComparer.OrdinalIgnoreCase))
            {
                userIds.Add(candidate);
            }
        }

        return (userIds, includeWatchers);
    }

    // ─── emission ───────────────────────────────────────────────────────
    private async Task EmitFiredAsync(
        EnabledTriggerRow trigger,
        string recordId,
        IReadOnlyList<string> recipientUserIds,
        bool includeWatchers,
        string operationId,
        CancellationToken cancellationToken)
    {
        var payload = JsonSerializer.Serialize(
            new TriggerFiredPayload(trigger.NotificationCategory, recipientUserIds, includeWatchers, trigger.NotificationTitle),
            PayloadOptions);

        var envelope = new EventEnvelope(
            Guid.NewGuid(),
            TriggerFiredEventType,
            trigger.WorkspaceId,
            recordId,
            ActorUserId: null, // system-emitted
            _clock.UtcNow,
            payload,
            operationId);

        await _eventSpine.EmitAsync(envelope, cancellationToken).ConfigureAwait(false);
    }

    // ─── parsing helpers ────────────────────────────────────────────────
    private static List<ConditionRule> ParseConditions(string conditionsJson)
    {
        var parsed = new List<ConditionRule>();
        if (string.IsNullOrWhiteSpace(conditionsJson))
        {
            return parsed;
        }

        var rows = JsonSerializer.Deserialize<List<ConditionJson>>(conditionsJson, PayloadOptions);
        if (rows is null)
        {
            return parsed;
        }

        foreach (var row in rows)
        {
            if (string.IsNullOrWhiteSpace(row.WhenFieldKey) || string.IsNullOrWhiteSpace(row.Comparator))
            {
                continue;
            }

            // Only WhenFieldKey / Comparator / CompareValue are used by Evaluate; the other ConditionRule
            // fields are irrelevant to a trigger's "when" clause.
            parsed.Add(new ConditionRule("notify", row.WhenFieldKey, row.Comparator, row.CompareValue, null, 0));
        }

        return parsed;
    }

    private static List<string> ParseRecipientKeys(string recipientsJson)
    {
        if (string.IsNullOrWhiteSpace(recipientsJson))
        {
            return new List<string>();
        }

        return JsonSerializer.Deserialize<List<string>>(recipientsJson, PayloadOptions) ?? new List<string>();
    }

    private static Dictionary<string, object?> ParseFieldValues(string fieldValuesJson)
    {
        var values = new Dictionary<string, object?>(StringComparer.Ordinal);
        if (string.IsNullOrWhiteSpace(fieldValuesJson))
        {
            return values;
        }

        using var document = JsonDocument.Parse(fieldValuesJson);
        if (document.RootElement.ValueKind != JsonValueKind.Object)
        {
            return values;
        }

        foreach (var property in document.RootElement.EnumerateObject())
        {
            values[property.Name] = ToScalar(property.Value);
        }

        return values;
    }

    private static object? ToScalar(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.String => element.GetString(),
        JsonValueKind.Number => element.GetRawText(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Null => null,
        _ => element.GetRawText(),
    };

    private sealed record ConditionJson(string? WhenFieldKey, string? Comparator, string? CompareValue);

    private sealed record TriggerFiredPayload(
        string Kind, IReadOnlyList<string> RecipientUserIds, bool IncludeWatchers, string Title);
}
