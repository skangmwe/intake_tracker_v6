# slice-feature-import-export — security-review findings

## Iteration 1

Checklist applied: `api-middletier-security.md` (OWASP A01–A10 + advanced / data-protection).

Findings: **none.**

Verified:
- **A01 Broken Access Control.** Feature export access is the caller's AI-hub membership, enforced inside
  `FeaturesService.QueryAsync(userId)` — a non-member yields `null`, which `FeatureIoObject.BuildExportAsync`
  returns and `ExportService` maps to `Denied` (403), never a silent empty file. Feature import is gated by
  `FeaturesService.CreateAsync` (hub Member) per row. Request paths unchanged; `ExportService` keeps its
  workspace-Viewer gate. Forbidden → 403, never 404. Export never widens access (rows follow entitlements).
- **A03 Injection.** No raw SQL string-building. `RequestIoObject` uses EF `_db.Users.FirstOrDefaultAsync`
  (parameterized lambda); `ImportRunner` uses `ExecuteSqlRawAsync` with `SqlParameter` only (unchanged).
- **A04 Insecure Design.** Import stays create-only (never updates a live record); one bad row is flagged and
  skipped, never aborting the batch; required-field guards prevent partial Feature rows reaching the proc.
- **A09 Logging.** No CSV values, emails, names, or record content logged; the runner logs only `ImportId` +
  `RowIndex`. The actor's email is read for the requestor fallback but never logged.
- No secrets introduced; no new third-party calls; no new endpoints (registry is the extension point).

Auto-applied mechanical fixes: none required.
Architectural / pending-decision findings: none.
