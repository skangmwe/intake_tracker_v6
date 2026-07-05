# slice-announcements-cdea4f0 — security-review findings (OWASP A01–A10)

## Iteration 1

- **A01 Broken access control** — every read/mutation is server-side gated. Consumer reads are audience-gated in SQL (`usp_GetAnnouncementById` / `usp_QueryAnnouncements`); a caller outside the audience gets **0 rows → 403, never 404** (existence not disclosed, BS §22.6). Item mutations resolve author-or-admin from the row (`CanManageAsync` = author OR `AccessGuard` WorkspaceAdmin); create/manage-list gate WorkspaceAdmin at the controller. **Verified live:** a plain member cannot read a Draft; the author can. Audience never widens access — resolution is members ∩ audience only (verified live on the fan-out). ✓
- **A02 Cryptographic failures** — no secrets introduced; no new credential paths. ✓
- **A03 Injection** — every SQL parameter is a `SqlParameter`; no string concatenation/interpolation into SQL. Audience arrives as validated JSON; procs parse via `JSON_VALUE`/`OPENJSON` with `TRY_CONVERT`. **XSS:** announcement body is rendered as text, not HTML (no `dangerouslySetInnerHTML`). ✓
- **A04 Insecure design** — publish emits the fan-out event exactly once (Draft→Published transition), so a re-publish cannot re-spam bells. Retire is soft (never hard-delete). ✓
- **A05 Security misconfiguration** — user-scoped reads inherit `Cache-Control: private, no-store`. ✓
- **A06 Vulnerable components** — no new dependencies. ✓
- **A07 Auth failures** — all endpoints behind the fallback authorization policy; token-less requests → 401 (verified by the endpoints tests). ✓
- **A08 Integrity** — publish/retire state transitions guarded in the procs (Retired is immutable / cannot be published). ✓
- **A09 Logging** — no logging added; no PII/content in logs. The bell `Summary` stores the announcement **title** — broadcast notice text authored for the audience (Audience Level B/C, §2.7), not matter content; it is delivery data shown to authorized recipients, not a log line (documented decision). ✓
- **A10 SSRF** — no outbound requests introduced. ✓

### Findings
- **No Critical/High/Medium.** No Pending-decision items. Security review **CLEAN**.
