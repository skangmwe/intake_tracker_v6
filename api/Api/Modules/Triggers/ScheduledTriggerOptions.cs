// Scheduled-trigger timing, bound from the "ScheduledTriggers" configuration section via IOptions<T>
// (api-coding-standards.md — Configuration; api-secrets.md — timing values are non-secret config).
// Defaults mirror appsettings so the app is safe if the section is absent; deployment overrides them.

namespace McDermott.AiTracker.Api.Modules.Triggers;

public sealed class ScheduledTriggerOptions
{
    public const string SectionName = "ScheduledTriggers";

    /// <summary>Hour of day (0–23) in the deployment clock's UTC frame (containers run UTC) at or after
    /// which the once-daily sweep runs (design spec §3.4; default 10:00). A single global hour — a
    /// per-workspace hour / timezone is a later enhancement (Open Q1).</summary>
    public int DailyHour { get; set; } = 10;

    /// <summary>Seconds between polls that check whether today's sweep is due yet. Default 300 (5 min) —
    /// the date-granular watermark caps firing at once per record per day regardless of poll frequency.</summary>
    public int PollSeconds { get; set; } = 300;
}
