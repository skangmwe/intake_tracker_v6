# slice-import-export-wizards — security review findings

## Iteration 1
OWASP A01–A10 + data-protection walked over the changed API + web surface.

- A01 Access Control: object-export gated Viewer+ on the workspace (export never widens access — rows come from the already-access-filtered IRequestsService.QueryAsync, BS §22.4); CSV import gated WorkspaceAdmin before any streaming; io/objects catalog gated Viewer+. Ownership enforced server-side; forbidden → 403 never 404.
- A03 Injection: CSV formula-injection guard (Neutralize: = + @ tab CR) reused in the generic WriteDataset; RFC-4180 escaping reused. Import mapping fieldKeys validated against the object's declared importFields allowlist; objectType validated against the registry; required fields enforced at the boundary. No new dynamic SQL (export reuses QueryAsync). Mapping JSON deserialized to a closed record shape (ImportColumnMapping = int + string) — no polymorphic gadget surface.
- A05 Misconfig: new endpoints inherit the default `Cache-Control: private, no-store` middleware.
- PII/A09 Logging: no CSV values, file names, or requestor emails added to any log; only ids/row-indices.
- Dependencies: no new npm/NuGet package (client CSV preview is a hand-rolled RFC-4180 parser — web-dependency-security.md satisfied).

No findings.

## Final: CLEAN
