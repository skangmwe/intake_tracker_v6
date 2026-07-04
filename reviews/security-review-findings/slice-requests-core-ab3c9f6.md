# slice-requests-core-ab3c9f6 — security-review findings

**Scope:** slice 5 (Requests core) diff. Walked OWASP A01–A10 + data-protection for the changed layers.

## Iteration 1

### A01 Broken access control
- Every Requests read/write path resolves to the caller's entitlement server-side: `IAccessGuard.HasWorkspaceLevelAsync` (Member+ writes, Viewer+ reads); record-scoped reads bake access into `usp_GetRequestByIdForUser` (JOIN to membership → 0 rows → 403). Ownership/non-existence both return **403, never 404** — existence is never disclosed (BS §22.6). Drafts are owner-scoped in the proc predicate. **No finding.**

### A03 Injection
- All API SQL runs through stored procs with `SqlParameter` for every dynamic value (create/get/query/patch/stage/hold + drafts); the list read's raw ADO.NET command parameterises every value; no string-built or interpolated SQL. The proc `LIKE N'%' + @NameContains + N'%'` concatenates a **bound parameter value** with literal wildcards inside a static statement — safe (not SQL text building). **No finding.**
- Web: no `dangerouslySetInnerHTML`, `eval`, `new Function`, or `innerHTML` in the slice-5 code. **No finding.**

### A02 / A05 Crypto & misconfig
- No hardcoded secrets, connection strings, or keys in the slice-5 code (DB is LocalDB Windows-auth for dev; prod overrides via config per `api-secrets.md`). **No finding.**

### A09 Logging & PII
- Event-spine payloads carry ids/enums only (`new {}`, `{ toStage }`, `{ held }`) — never field values, names, descriptions, or client/matter numbers (`api-pii-handling.md`, `api-logging.md`). No new log statement adds PII. **No finding.**

### Data protection
- Content field values (Confidential) stored in `FieldValues` JSON in SQL (encrypted-at-rest at the platform level); never logged. Attachments/comments not in scope this slice. **No finding.**

## Result

**No Critical/High/Medium/Low security findings.** The slice-5 diff is clean against the OWASP + data-protection checklist. (Deep DB-integration behaviours are additionally covered by tSQLt, which is deferred to the CI gate — see the iteration log.)
