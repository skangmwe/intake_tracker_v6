# slice-announcements-frontend-7decb1e — security review findings

**Scope:** announcements reconciliation slice 3 (frontend). OWASP A01–A10 + web-frontend security
checklist over the changed files.

## Iteration 1 — 0 findings

- **A01 Broken access control** — the "Posted by" author and every mutation are enforced server-side
  (slice 1's controller validates the chosen author is a member of the target workspace → 400/403, and
  the WorkspaceAdmin gate is unchanged). The frontend never grants access; it sends a choice the API
  authorises. No client-side authorization decisions were added.
- **A03 Injection / XSS** — no `dangerouslySetInnerHTML`, `eval`, or `new Function`. All user-entered
  values (title, body, publish date-time) render as React text nodes. The `datetime-local` value is
  converted with `new Date(...)` and only ever sent as an ISO string in a JSON body.
- **A02 Cryptographic / secrets** — no secrets, tokens, or keys added; nothing written to
  `localStorage` / `sessionStorage`. Auth stays with the existing MSAL flow.
- **A08 Data integrity** — the manage list is read from the API (`queryManagedAnnouncements`); the client
  derives nothing about visibility. Status is the API-derived display value; the client only maps it to a
  pill label.
- **A09 Logging** — no logging added; no PII written anywhere. Member display names/emails come from the
  members API and are rendered, never logged.

## Final status: CLEAN (0 findings)
