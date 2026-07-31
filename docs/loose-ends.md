# Loose ends & dormant features — triage list

> A read-only audit (2026-07-30) of features the code **hints at but doesn't fully wire** — surfaced
> while planning the P2/P3 mods. These are **not** P2/P3 build items; they're a decide-**finish / hide /
> backlog** list. The codebase is otherwise clean (no `NotImplementedException`, no stray TODOs in API
> source) — dormancy here is structural (write-only columns, unread config, unreachable UI), not sloppiness.
> Anything that directly reshaped a P2/P3 item was already folded into `handoff-p2.md` / `handoff-p3.md`.

## 🔴 Act before the next release — live controls that silently do nothing → ✅ DECIDED: FINISH BOTH
A user takes a deliberate action expecting an effect and gets none. **Decided (2026-07-30): finish both — moved to `handoff-p2.md` → Cluster N.**

| Feature | Where | What happens | Decision |
|---|---|---|---|
| **@mentions in comments** | `web/src/features/comments/ActivityTab.tsx:142-144` | Composer highlights `@handle` and shows a "Mentions: @x" preview, but `mentionedUserIds` is hardcoded `[]` — the mention resolves to no one and **notifies nobody**. | ✅ **FINISH** — a mention sends an in-app notification (P2 **N1**) |
| **Copy record → "include attachments"** | `api/.../TypedLinks/CopyService.cs`, `web/src/features/typed-links/CopyModal.tsx` | A live checkbox posts `includeAttachments`; the DTO accepts it but `CopyService` **never reads it** (was a no-op "until Attachments exists" — Attachments now exists). | ✅ **FINISH** — attachments accessible in the copy (P2 **N2**) |

## 🟠 Half-built features — decide finish / hide / backlog
Foundations exist; the last mile (or the admin surface) is missing.

| Feature | Where | Gap | Rec |
|---|---|---|---|
| **Per-workspace SLA tuning** (due-soon window, benefit-review offset, approval respond-by) | migrations `…049`, `…087`, `…092`; read by `usp_GetHomeWork`/`usp_OpenGate`/`usp_QueryRequests` | 3 config columns are **read** but **written by nothing** (`usp_ProvisionWorkspace` omits them, no settings endpoint) — every workspace frozen at defaults 3 / 90 / 5. Migrations say "admin editor is a later slice." | Finish (build the admin editor) or backlog |
| **Proxy / off-platform sign-off** | `api/.../Gates/ApprovalsController.cs` `POST …/proxy-decision`; `usp_SubmitDecision` `isProxy` | Full backend + a web "(recorded by admin)" badge exist, but **no web caller** ever posts a proxy decision — write side unreachable. | Finish (add the admin UI) or backlog |
| **Config-driven relationship tabs are read-only** | `web/src/features/relationships/GenericRelatedRecordsTab.tsx` | Lists linked records + counts but has **no link/create affordance** — the "New ___" in its header comment never renders. *(Folded into Cluster C.)* | Finish with Cluster C |
| **Composer widget palette hides 3 of 7 widgets** | `web/src/shared/dashboards/widgetTypeCatalog.ts` vs `WidgetRenderer.tsx` | `histogram`, `heatmap-matrix`, `kpi-with-trend` renderers are fully built but **not user-selectable** (only via seeded dashboards). | Backlog / decide (cheap to expose) |
| **Per-view record counts** in the saved-view picker | `web/src/features/requests/components/RequestsListPage.tsx:435-438` | Non-active views show an em-dash instead of a count (`TODO(slice-14)`). | Finish or backlog |
| **`LegacyId` on records** | `api/.../Requests/RequestDtos.cs:55`, `shared/types/requests.ts:84` | In the API contract + TS type, but **no DB column**, mapper hardcodes `null`. A contracted-but-unwired legacy-ID passthrough. | Backlog or drop from the contract |

## ⚪ Dead code — hide / delete (housekeeping)

| Item | Where | Note |
|---|---|---|
| **`RelationshipsSidePanel`** | `web/src/features/relationships/RelationshipsSidePanel.tsx` | Dormant/unreachable — imported by no surface (live UI is `typed-links/RelationshipsCard`). *(Cluster C pointer corrected.)* |
| **`PlaceholderPage` route system** | `web/src/App.tsx:89-91,146-152` + `pages/PlaceholderPage.tsx` | `PLACEHOLDER_ROUTES` now resolves empty; only ever renders as the `*` 404 fallback. |
| **`line-timeseries` widget type** | `web/src/features/dashboards/components/WidgetRenderer.tsx:30-33` | Declared type + layout but renderer returns `null`; absent from the palette. *(Roadmap L1 should absorb this.)* |
| **`usp_SetRequestHold`** | `database/procedures/requests/usp_SetRequestHold.sql` | Orphan — its own header says superseded by `usp_UpsertRequestStatusHold`. Only genuinely-uncalled proc of ~200. |
| **Link-field self-describing config columns** | `FieldDefinition.TargetObjectType` / `AllowMultiple` / `ReverseLinkLabel` (migration `…056`) | INSERTed by `usp_UpsertRelationship` but **read by nothing** — superseded storage. |
| **`idb.openStore` scaffold** | `web/src/shared/idb.ts:12-13` | `throw new Error('…scaffold stub…')`; imported nowhere. |
| **`EdgeStates` API module** | `api/Api/Modules/EdgeStates/README.md` | README-only scaffold; likely never gains API code (web concern). |
| **Stale "stub" header comments** | `RecordDetailPage.tsx:3-4`, `IntakeFormPage.tsx:7`, `deployRecovery.ts:3-6` | Screens are now fully implemented / behavior is live — comments are misleading to auditors. Fix the comments. |

## 🔵 Verify (infra / architecture — not a code fix)

| Item | Where | Question |
|---|---|---|
| **AI config keys** | `api/Api/Program.cs` (`Ai:AnthropicApiKey`, `Ai:OpenAiApiKey`), `AiOptions.cs` (`AzureOpenAiEndpoint`, `EmbeddingDeployment`) | Read but set **nowhere in committed config** — by design (Key Vault), but confirm the **deploy-time injection actually exists**, or the whole AI surface + daily embedding sweep is dormant/throws. |
| **Worker is a no-op** | `api/Worker/Program.cs`, `ScaffoldNoopService.cs` | The Worker registers only a no-op service; notifications + CSV import run **in-process** today. The Service-Bus/Worker offload the architecture implies is not wired — fine at current scale; revisit before load. |
| **`Swagger:Enabled` flag** | `api/Api/appsettings.json`, `Program.cs:347-350` | Config key is **read nowhere** — Swashbuckle deferred. Inert flag: wire Swagger or drop the key. |
