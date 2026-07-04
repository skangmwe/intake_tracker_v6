# slice-tasks-76c3eb4 — security review findings

## Iteration 1
No Critical/High findings. SQL: all dynamic values parameterised (SqlParameter); the RepoUrl rollup subquery is static SQL. Access: every task path gates via usp_GetRequestByIdForUser (membership) → 403 never 404; bundles gated by IAccessGuard.Viewer; procs re-gate (defense in depth). PII: task titles/notes/field values never logged; event payloads carry ids only. XSS/tab-nabbing: repo/URL links use rel=noopener noreferrer and non-http(s) values are prefixed with https:// (no javascript: execution). Cache-Control private/no-store inherited from middleware.
