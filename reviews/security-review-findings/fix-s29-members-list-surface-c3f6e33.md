# fix-s29-members-list-surface-c3f6e33 — security review

## Iteration 1
OWASP A01–A10 walk across the changed DB/API/web surface. No open findings.
- **A01 Access control:** the new suspension endpoint re-checks WorkspaceAdmin via `AccessGuard` (never trusts the client); ownership violation → 403, never 404. The proc will not toggle the firm-wide disabled flag for a user who is not a live member of the target workspace.
- **A03 Injection:** every dynamic value in `SetSuspensionAsync` is a `SqlParameter` (no concatenation/interpolation into the SQL string); the proc is parameterized.
- **A04 Design:** suspend honours the same pending-named-individual sign-off safety floor as deactivate (409); reactivate has no floor by design.
- **A09 Logging:** no PII (display name / email) logged; the spine event payload carries only `UserId` (a pseudonymous GUID). No secrets touched.
- Web: no `dangerouslySetInnerHTML`, no `eval`; the portaled menu adds listeners in `useEffect` and cleans them up.
