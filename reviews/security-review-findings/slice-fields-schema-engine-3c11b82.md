# slice-fields-schema-engine-3c11b82 — security review findings

## Iteration 1

OWASP A01–A10 walk over the database / api / frontend diff. **No findings.**

- A01 Access control — `AccessGuard` (workspace level + platform-admin) on every endpoint; ownership violations 403, never 404.
- A03 Injection — all SQL via `SqlParameter` / `OPENJSON WITH`; no dynamic string concatenation; `ExecuteSqlRaw` calls use compile-time-constant EXEC strings with parameters.
- A02/A05 — no secrets in code/config; `appsettings.Development.json` carries only the dev-auth bypass flag (dev-only).
- Frontend — no `dangerouslySetInnerHTML`, `eval`, or unsanitised HTML; query strings built via the shared `withQuery` util.
- Logging/PII — field schema is configuration; no user content or PII logged.
