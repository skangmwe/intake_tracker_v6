---
slice: 29-toolkit
capability: An analyst browses the Reference → Toolkit surface (gallery/list), creates an item by paste or upload, downloads an item's file, and edits fields in place; workspace-local object with kinds Playbook/Plugin/Prompt.
spec-section: build spec §2.6/§19, v2-reconciliation.md §Model deltas 5 + §API deltas Toolkit, blueprint S43
started: 2026-07-19T13:32:03-04:00
ended: 2026-07-19T14:21:32-04:00
duration: 00:49:29
---

# Slice 29 — Toolkit object + S43 surface

The final R1 slice. Adds the reference-local **Toolkit** object (module 26) and the S43 surface:
DB table + 6 procs + tSQLt; `Modules/Toolkit` (controller/service/DTOs/options) with a single
row-level blob attachment; `web/src/features/toolkit/` surface (gallery/list + detail & editor side
sheets) + a new shared `SideSheet` primitive. API + Api.Tests build **0/0**; the Toolkit controller
suite is **29/29 green**. Web `tsc`/`jest`/Playwright + tSQLt are deferred to the `/dev-ship` gate
(no local `node_modules` / SQL Server — slices 15/16/21/23/27/28 precedent).

## Decisions (prototype-authoritative on the prototyped S43 screen — handoff README precedence)

- **D1 — Field set = what S43 renders.** Built Type, Status, Maintainer, One-liner, Description,
  How-to-use, Body (asset content), and a single Attachment. **Dropped** the §19 fields the prototype
  omits on S43 (capability tags, tech/stack, reference URLs, related-links). Analyst-confirmed.
- **D2 — Record ID mints from the workspace prefix** (`AIS-00000NNN`) via `usp_MintRecordId`, doubling
  as both the API id (`/toolkit/{itemId}`) and the displayed Record ID. The prototype's `TOOL-` prefix
  is a mock cosmetic; this matches how Features/Requests actually mint. Diverges from
  v2-reconciliation model-delta-5's `Id uniqueidentifier` — the minted NVARCHAR(20) id is the as-built
  convention across every other object.
- **D3 — Status = `Active/Draft/Archived`** (the prototype), not §19's `Draft/Published/Deprecated`.
  Retire/restore is soft-delete, **separate** from the Status display field (an Archived item is still
  listed; a retired item is hidden).
- **D4 — Maintainer is free text** (no user-directory endpoint in R1 — slice 17/24 precedent). The
  prototype's editor uses a free-text "Maintainer" input, so this matches exactly.
- **D5 — "Times used" is hidden entirely in R1** (analyst decision). R1 has no usage instrumentation
  (usage-metrics.md is R2); showing `0` everywhere reads as broken. The list column + detail stat are
  omitted — the one visible divergence from the prototype layout, chosen over a dishonest zero.
- **D6 — Attachment is a row-level blob**, not the Attachments-module table. `AttachmentBlobPath` +
  `FileName` + `ContentType` + `SizeBytes` live on the `ToolkitItem` row (per model-delta-5), streamed
  via the shared `IBlobStreamer` (slice 11). Create/patch are **multipart** (`payload` JSON part +
  optional `file` part); download is `GET /toolkit/{id}/attachment`. The api-blob-attachments error
  chain is honoured (blob-fail → no row → 502; SQL-fail-after-blob → delete blob → 500).
- **D7 — Migration 066 (seed ToolkitItem system fields) dropped.** Toolkit is a **real-column** object,
  not a FieldValues/FieldDefinition object, and slice 25 never built a live object-registry surface
  that would consume ToolkitItem `FieldDefinition` rows. Seeding them would be dead data. Object
  registration reduces to: `'ToolkitItem'` already in the `FieldObjectType` union + the CK constraint
  widened (migration 056), plus the already-present static sidebar entry (slice 2). If a future S30
  Objects tab needs ToolkitItem's system band, that is a small follow-up — not built speculatively here.
  **This reduces the slice-plan's declared scope; surfaced here per Execution Discipline.**
- **D8 — List read is `POST /workspaces/{id}/toolkit/query`** (not the contract's `GET
  /workspaces/{id}/toolkit`), matching api/CLAUDE.md's POST-with-body convention + the Features
  `/query` precedent (a GET list would also collide with `POST …/toolkit` create).
- **D9 — Retire/restore self-gate on Member+ inside the proc.** Both procs run the membership check +
  flip `IsDeleted` in one `UPDATE … WHERE EXISTS(membership … Level IN (Member, WorkspaceAdmin))`,
  returning a `@Changed` bit (0 → API 403). This resolves the retired-row-visibility problem (a retired
  item is excluded from the gated read, so a resolve-then-mutate dance wouldn't find it) and keeps the
  API thin. The endpoints exist for CRUD/contract completeness; **the S43 UI surfaces neither** (the
  prototype renders no retire/restore control).
- **D10 — New shared `SideSheet` primitive** (`web/src/shared/components/Disclosure/SideSheet.tsx`).
  The prototype renders the Toolkit detail + editor as side sheets and none existed; added a
  right-anchored, slide-in, Escape/scrim/close dialog to the Disclosure family (disclosure-surfaces.md).

## Contract changes

- `shared/types/toolkit.ts` extended from the slice-25 stub: added `status`, `maintainer`, `howTo`,
  `ToolkitAttachmentInfo` (fileName/contentType/sizeBytes/downloadUrl) + `eTag`; dropped `timesUsed`
  (never present) and replaced the `attachmentId` reference with row-level attachment metadata. Barrel
  already exported `./toolkit`; `ToolkitItemId` branded id + error codes already present.
- New API: `POST /workspaces/{id}/toolkit/query` · `POST /workspaces/{id}/toolkit` (multipart) ·
  `GET /toolkit/{id}` · `PATCH /toolkit/{id}` (multipart) · `POST /toolkit/{id}/retire` ·
  `POST /toolkit/{id}/restore` · `GET /toolkit/{id}/attachment`. Viewer+ to read, Member+ to write;
  403-not-404 everywhere.
