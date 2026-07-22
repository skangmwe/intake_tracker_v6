# fix-announcement-archive-now-786fbcd — security review findings

**Scope:** announcements "Archive now" wiring (frontend). OWASP A01–A10 over the changed files.

## Iteration 1 — 0 findings

- **A01 Broken access control** — archiving goes through the existing `POST /announcements/{id}/retire`
  endpoint, which resolves author-or-WorkspaceAdmin server-side. The frontend adds no client-side
  authorization; it sends the id the API authorises. "Archive now" is only *offered* for non-terminal
  rows in the UI, but the API remains the authority (and is idempotent on already-archived rows).
- **A03 Injection / XSS** — the dialog renders the announcement title as a React text node inside
  `<strong>`; no `dangerouslySetInnerHTML`, `eval`, or dynamic execution.
- **A08 Data integrity** — the confirm passes only the announcement id to the retire mutation; no
  client-derived state changes.
- No secrets, no PII logging, nothing written to storage.

## Final status: CLEAN (0 findings)
