# slice-requests-core-ab3c9f6 — code-review findings

**Scope:** slice 5 (Requests core) diff — DB (`database/migrations|procedures|tests/requests`), API (`api/Api/Modules/Requests`, `Program.cs`, `Data/*`), web (`web/src/features/requests`, `web/src/shared/components/{Table,Feedback,Form}`), shared types.

## Iteration 1

### Deterministic gates
- **Design-conformance** (`check-design-conformance.sh --web-required`): **PASS** — 0 violations across 124 files; every colour/radius traces to a token.
- **Web `tsc --noEmit`:** clean. **API `dotnet build`** (Api + Api.Tests): clean, 0 warnings.

### API (reviewed against `api-middletier.md`)
- Controllers route/authorize only; `IAccessGuard` level checks (Member+ writes, Viewer+ reads); **403 never 404** for ownership/non-existence (BS §22.6); ProblemDetails with stable `https://mws.ai/errors/*` types; `CancellationToken` flowed; OperationId pulled from `HttpContext.Items`. **No findings.**
- Service: all data access via stored procs with `SqlParameter` (no string-built SQL); the two-result-set list read uses raw ADO.NET with parameters; `IEventSpine` emits once per state change; `displayStatus` derivation matches the seed precedence. **No findings.**

### DB (reviewed against `database-backend.md`)
- Procs: `SET NOCOUNT/XACT_ABORT ON`, TRY/CATCH + `@@TRANCOUNT` rollback, parameter-sniffing locals, `CREATE OR ALTER`, header comments. Migrations idempotent + rollbacks. Every FK indexed; covering index for the list. **No findings.**

### Web (reviewed against `web-frontend.md`)
- No `as any` / `@ts-ignore`; no inline style-object props; no `dangerouslySetInnerHTML`/`eval`; no leftover `console.*`. Autosave debounce timer is cleared on unmount **and** before re-arming (`RecordDetailPage.tsx:131-149`); the re-seed effect's exhaustive-deps deviation is documented. Loading/error/empty states rendered explicitly. **No High findings.**

### Findings

| # | Severity | Fix class | File | Rule | Issue | Proposed fix |
|---|---|---|---|---|---|---|
| 1 | Medium | Architectural | `web/src/features/requests/components/RequestsListPage.tsx` (407 lines), `RecordDetailPage.tsx` (348), `IntakeFormPage.tsx` (315) | `web-component-architecture.md#component-length` | Page files exceed the 200-line component guideline (250 hard cap for route components) even after in-file sub-component extraction; the main page components are likely > 200 lines. | Extract further into feature sub-component files (`RequestsGrid`, `RequestsToolbar`; `IntakeSection`→own file; `IntakeTab`/`StatusTab`→own files). Defer-eligible; not a correctness/security risk. |

No Critical/High code-review findings. Finding #1 is a polish/refactor item (architectural — developer decision).
