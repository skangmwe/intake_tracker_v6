---
slice: 18-views-audit
capability: A workspace admin manages shared saved views and reads the workspace audit log.
spec-section: BS §10.5 (view/dashboard locality), §12 (audit surfaces); S32, S33
started: 2026-07-06T10:03:15-04:00
ended: 2026-07-06T10:36:13-04:00
duration: 00:32:58
---

# Slice 18 — Views & dashboards admin (S32) + Workspace audit (S33)

Two workspace-admin surfaces. Both `[deferred]` screens (no prototype) — built from the blueprint,
styled to match the existing admin surfaces (S29/S30/S31).

## Decisions (the parts the diff can't carry)

1. **S32 shared-dashboards management → deferred to slice 23.** The `SavedDashboard` table + Dashboards
   module are owned by slice 23 (data-model §Slice-1 note; module-boundaries §15), and no dashboards
   exist to manage until slice 23 seeds them. Slice 18 ships the S32 shared-**views** management fully;
   the dashboards panel is an explicit "arrives with dashboards" note (`role="note"`), not a dead
   control. **Slice 23 must replace that note with the real panel** (audience picker · promote · retire
   for shared dashboards) — recorded in slice-plan §Slice 23 "Carried from slice 18". Same build-order
   pattern as 9→11 and 13→22.

2. **Audit query is `POST`, not `GET`.** api-contracts §18 first sketched `GET /…/audit/query`, but the
   filter set is multi-field (date range / actor / record / event type) so it takes a JSON body per
   api/CLAUDE.md, matching every peer `/query` endpoint (requests, notifications, search). Contract
   updated to `POST`.

3. **`PATCH /saved-views/{id}` shared-scope permissions were already satisfied by slice 14.**
   `SavedViewsService.CanWriteAsync` already gates shared create/edit/promote to WorkspaceAdmin. Slice
   18 added the S32 surface that exercises it (promote personal→shared, set/clear default, retire) — no
   new saved-views API. The PATCH endpoint is a full replace, so the S32 UI rebuilds the whole
   `SavedViewUpsertRequest` from the `SavedViewDto` with one field overridden (`toUpsertRequest`).

4. **No migration.** `AuditEntry` + `IX_AuditEntry_Workspace_EventAt_EventType` were created in slice 1
   *for this slice*; `SavedView` exists from slice 14. The only DB artifact is the new proc
   `usp_QueryWorkspaceAudit` (two result sets: page rows + total count; workspace-scoped; joins `Users`
   for the actor display name — an entitled-admin read of PII, never logged).

5. **Access is API-side.** Both surfaces are WorkspaceAdmin-only; the controller `AccessGuard` check is
   the single authoritative gate (403, never 404). The audit proc's workspace scope is defence-in-depth.

## Shape

- `shared/types/audit.ts` (new): `AuditLogRowDto`, `AuditLogQuery`. Registered in the barrel +
  shared-types.md. Distinct from `collaboration.ts`'s per-record `AuditEventItem`.
- API `Modules/Audit`: `AuditController` (`POST /workspaces/{id}/audit/query`), `AuditService`
  (raw-ADO two-result-set read, mirrors `SearchService.SearchFullAsync`), `AuditDtos`.
- Web `features/audit`: `WorkspaceAuditPage` + `AuditFilterBar` (applies on submit; actor options from
  the workspace member list) + `AuditLogTable` (payload behind a `<details>`). `features/saved-views`:
  `ViewsDashboardsPage` + `SavedViewsSection` + `RetireViewDialog` + `savedViewsAdminModel`.
- Routes `/admin/views` + `/admin/audit` wired in `App.tsx` (were placeholders).

## Notes for the review gate

- Pre-existing 13 tsc test-file errors (slices 6/8/11/12) are unchanged; this slice adds **0** new tsc
  errors and 35 new passing tests (8 suites).
