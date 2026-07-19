# slice-multi-dashboard-composer — security review (OWASP A01–A10)

## Iteration 1
- **A01 Broken Access Control:** every composer endpoint gates server-side — create (Shared→WorkspaceAdmin, Personal→Member+), widget CRUD (seeded→403 `seeded-dashboard-read-only`, else editor: Personal→author `CreatedBy`, Shared→WorkspaceAdmin), read (Personal→author-only). Inaccessible → **403, never a disclosing 404** (api-record-access.md). Access is enforced in the service, not the client.
- **A03 Injection:** all data access is parameterized `EXEC dbo.usp_* @p` with `SqlParameter`; dept/stage scope arrays serialize to JSON and are passed as a single `SqlParameter`, parsed server-side via `OPENJSON` — no string concatenation anywhere. Boundary validation on the controller rejects unknown widget types / metrics / dimensions / widths / oversize rowLimit.
- **A04 Insecure Design:** the seeded read-only guard is composer-path-only by design (S32 name/audience/retire preserved); Personal author-scoping prevents cross-user dashboard access.
- **A08 Data Integrity:** widget-list JSON is round-tripped with Web `JsonSerializerOptions`; malformed JSON degrades to an empty list (defensive), never throws into the request.
- **Logging / PII:** no widget content, names, or PII logged; the API logs only structural events. No secrets introduced.
- **Web:** no `dangerouslySetInnerHTML`, `eval`, or dynamic code; widget titles + labels render as text.

No open findings (Critical/High/Medium/Low): **CLEAN**.
