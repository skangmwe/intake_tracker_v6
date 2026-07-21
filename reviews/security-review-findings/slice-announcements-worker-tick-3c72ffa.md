# Security review findings — slice-announcements-worker-tick-3c72ffa

## Iteration 1

No findings.

OWASP A01–A10 walk against the API change set:
- **A01/A07 (access/auth):** no new endpoint or authorization surface — the scheduler is a system
  `BackgroundService`, not a request handler; it takes no user input.
- **A03 (injection):** `AnnouncementTickGateway` calls `FromSqlRaw("EXEC dbo.usp_TickAnnouncements")` — a
  compile-time-constant string with no dynamic values. All log statements use structured parameters, not
  concatenation.
- **A02/A09 (crypto/logging):** the `appsettings.json` addition (`AnnouncementScheduler:PeriodSeconds`) is
  non-secret config. Logs carry only counts, duration, and a record id (`AnnouncementId`) — no PII; the
  system sweep has no user principal, consistent with the `ImportProcessor` precedent.
- **A06 (components):** no new NuGet packages. (Pre-existing `NU1903` on `System.Security.Cryptography.Xml`
  is a transitive dev-only test dependency, not introduced by this slice.)
- **A08 (integrity):** keyless `AnnouncementTickRow` is a DB read-projection, never model-bound from HTTP;
  no `BinaryFormatter` / `TypeNameHandling`.
