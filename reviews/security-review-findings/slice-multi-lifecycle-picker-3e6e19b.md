# Security-review findings — slice-multi-lifecycle-picker-3e6e19b

## Iteration 1

OWASP A01–A10 walk over the diff (`api-middletier-security.md`, `web-frontend-security.md`).

**No findings.** Summary of the checks that matter for this slice:

- **A01 Broken access control** — new `GET /workspaces/{id}/lifecycles` is `Viewer+`-gated and returns
  `403` (never `404`) on denial, matching the sibling `GET .../lifecycle`. `ResolveLifecycle` operates on
  a **workspace-scoped** list, so an explicit `lifecycleId` from another workspace simply falls through —
  a request can never bind to a foreign workspace's lifecycle.
- **A03 Injection** — the list endpoint reuses the existing `usp_GetWorkspaceLifecycles` via a
  parameterised `EXEC` (`@WorkspaceId` SqlParameter); `lifecycleId` is a typed `Guid`, matched in-memory,
  never concatenated into SQL. No new raw SQL.
- **A09 Logging** — no PII / user content / secrets logged by any new code. Lifecycle names are non-PII.
- **Web** — no `dangerouslySetInnerHTML`, `eval`, or dynamic code. Lifecycle names render as escaped text
  in `<option>`/`<select>`. `lifecycleId` travels in the POST body, not a query string.
- No new dependency; no secret handling; no auth flow change.

**Pending-decision findings:** none.
