# slice-users-access-4a32c37 — security review

## Iteration 1

**Scope:** slice-17 diff — DB procs (`usp_ListWorkspaceMembers` / `usp_UpsertWorkspaceMembership` / `usp_DeactivateMember`), API `Users` module (`MembersController` / `MembersService` / `MembersDtos`), shared types, web `features/users`.

OWASP A01–A10 walk. **Result: CLEAN — no Critical / High / Medium.**

| OWASP | Finding |
|---|---|
| A01 Broken Access Control | **Pass.** Every endpoint (`GET`/`POST`/`DELETE /members`) is gated server-side at `WorkspaceAdmin` via `IAccessGuard` before any work; procs scope by `WorkspaceId`. Access violations return **403, never 404** (`api-error-handling.md`). The list read is admin-only because it exposes member PII. |
| A02 Cryptographic Failures | N/A — no secrets, tokens, or crypto introduced. |
| A03 Injection | **Pass.** All SQL is parameterized — `EXEC … @Param` with `SqlParameter` (service) and `THROW`/`OPENJSON` over stored data (procs). No string concatenation/interpolation into SQL. `OPENJSON` reads the stored `FrozenApproverSet` column, not request input. |
| A04 Insecure Design | **Pass.** Email→user resolution and the §6.8 deactivation floor follow the established `usp_AddApproverTeamMember` pattern. The firm-wide `IsDisabled` blast radius of deactivate is the analyst-confirmed §6.8 offboarding model (recorded as a decision), not an unintended escalation. |
| A05 Security Misconfiguration | N/A. |
| A06 Vulnerable/Outdated Components | **Pass.** No new npm or NuGet dependencies added. |
| A07 Identification & Auth Failures | **Pass.** Relies on the existing Entra auth + `EnsureUserMiddleware` + `IAccessGuard`; no new auth surface. |
| A08 Software & Data Integrity | **Pass.** Soft-delete semantics preserved; all three procs are idempotent; upsert reactivates rather than duplicating. |
| A09 Logging & Monitoring | **Pass — PII discipline holds.** The service does not log. Event-spine payloads (`membership.updated` / `member.deactivated`) carry only the pseudonymous `UserId` GUID + level + WasAdded — **never displayName/email** (`api-pii-handling.md` / `api-logging.md`). |
| A10 SSRF | N/A. |

### PII handling
`WorkspaceMemberDto` returns `displayName` + `email` (PII), but only to a `WorkspaceAdmin` over an access-gated endpoint carrying the default `Cache-Control: private, no-store`. Never logged. Conforms to `api-pii-handling.md`.

**No security findings require remediation.**
