// Announcement scheduler timing, bound from the "AnnouncementScheduler" configuration section via
// IOptions<T> (api-coding-standards.md — Configuration; api-secrets.md — a period is non-secret config).
// The default mirrors appsettings.json so the app is safe if the section is absent; deployment overrides it.

namespace McDermott.AiTracker.Api.Modules.Announcements;

public sealed class AnnouncementSchedulerOptions
{
    public const string SectionName = "AnnouncementScheduler";

    /// <summary>Seconds between scheduler sweeps of usp_TickAnnouncements (design spec §5: ~60s).</summary>
    public int PeriodSeconds { get; set; } = 60;
}
