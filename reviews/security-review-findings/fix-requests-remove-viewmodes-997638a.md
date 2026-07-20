# Security review — fix-requests-remove-viewmodes-997638a

**Scope:** `web/src/features/requests/components/RequestsListPage.tsx` (+ test). Checklist: `web-frontend-security.md` (OWASP A01–A10, web-specific).

## Iteration 1 — 0 findings

This is a **pure UI-removal** diff. It deletes a view-mode switcher, its render branch, and dead helpers/imports; it removes two tests. It introduces:

- No new user input handling, no new network calls, no query-string construction.
- No `dangerouslySetInnerHTML`, `eval`, or dynamic code execution.
- No auth, token, storage, or permission changes (access is still enforced server-side; the list query is unchanged).
- No new dependencies.

No security surface added or changed. **CLEAN.**
