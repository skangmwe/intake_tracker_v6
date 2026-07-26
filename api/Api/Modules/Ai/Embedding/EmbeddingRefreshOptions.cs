// Embedding-refresh timing/sizing, bound from the "EmbeddingRefresh" configuration section via IOptions<T>
// (api-coding-standards.md — Configuration; all values are non-secret config). Defaults mirror appsettings
// so the app is safe if the section is absent; deployment overrides them.

namespace McDermott.AiTracker.Api.Modules.Ai.Embedding;

public sealed class EmbeddingRefreshOptions
{
    public const string SectionName = "EmbeddingRefresh";

    /// <summary>Hour of day (0–23) in the deployment clock's UTC frame (containers run UTC) at or after which
    /// the once-daily embedding sweep runs. Matches the Phase-3 trigger sweep hour (default 10:00) so the two
    /// daily background passes share a predictable low-traffic window.</summary>
    public int DailyHour { get; set; } = 10;

    /// <summary>Seconds between polls that check whether today's sweep is due yet. Default 300 (5 min) — the
    /// once-per-day watermark caps the sweep at once per day regardless of poll frequency.</summary>
    public int TickPollSeconds { get; set; } = 300;

    /// <summary>How many records to embed per EmbedBatchAsync call. Default 16 — a modest batch that keeps a
    /// single provider call small while amortising round-trips across a workspace's candidates.</summary>
    public int BatchSize { get; set; } = 16;
}
