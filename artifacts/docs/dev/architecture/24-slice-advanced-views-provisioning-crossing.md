---
slice: 24-advanced-views-provisioning-crossing
capability: Advanced list views (Kanban/timeline/agenda/gallery — S11), an S38 workspace-provisioning wizard, and an admin-editable S35 crossing map (propose/confirm).
spec-section: BS §10.5 (advanced views), §15 Phase 2 (provisioning, crossing map), §6.2 (crossing map), §1.1 (provisioning)
started: 2026-07-06T21:20:35-04:00
ended: 2026-07-06T22:42:34-04:00
duration: 01:21:59
---

# Slice 24 — Advanced views · S38 provisioning wizard · S35 editable crossing map

The final Release-1 slice, built in three checkpointed sub-cuts (A → B → C), each verified before the
next. All three screens were `[deferred]` (not in the prototype), so each was built from the blueprint and
styled to the repo design system. Decisions the diff/commit can't carry:

## Sub-cut A — Advanced views + S11 gallery

- **A shared `RecordViews` library** (`web/src/shared/components/RecordViews/`): `ViewModeToggle` segmented
  control + `KanbanView`/`TimelineView`/`AgendaView`/`GalleryView`, all rendering over one normalised
  `RecordViewItem` shape so a surface maps its rows once. `AuthImage` fetches bearer-authenticated
  thumbnails; `groupByDate` is a pure date-grouping helper. Wired into **S2 Requests** (table/board-by-stage/
  timeline/agenda) and **S9 Feature catalog** (table/gallery → **S11**), via a new `ViewBar` `layoutSlot`.
- **View mode is ad-hoc per-surface local state, not persisted on saved views.** The blueprint names a
  "Gallery view toggle"; persisting layout on the SavedView table would be a speculative schema change
  (simplicity-first). The toggle is offered to all viewers (presentation never widens access; S11 is
  "all roles"). Advanced views render the current access-filtered page; pagination stays (noted limit).
- **Card click uses a real stretched-link `<button>`** (accessibility.md — a real button, not
  `role="button"` on an `<article>`; caught by the jest-axe `aria-allowed-role` check and fixed).
- **Gallery thumbnails are real:** `usp_QueryFeatures` gained an `OUTER APPLY` to the first native image
  attachment; `FeaturesService` maps it to `/api/v1/attachments/{id}/content`; placeholder when absent.

## Sub-cut B — S38 workspace-provisioning wizard

- **The API (`POST /workspaces`) already existed (slice 19) but took a raw admin `Guid`** — unusable for a
  human wizard, and R1 has no user-directory endpoint. `usp_ProvisionWorkspace` was extended with an
  `@InitialAdminEmail` resolved in-proc (mirrors `usp_UpsertPlatformAdminGrant`), reusing the existing
  `50073` → UnknownAdmin mapping. Shared `WorkspaceProvisionRequest` is now `initialAdminUserId?` /
  `initialAdminEmail?` (exactly one).
- **The wizard** (`WorkspaceProvisioningPage`) is a 3-step stepper (Details → Initial admin → Review) with a
  review-before-commit gate and a success surface. New route `/platform/workspaces` + a Platform → Workspaces
  nav link. Fixed a pre-existing `navItems` test (slice 19 added the Platform section but never updated the
  assertion) since this slice edits `navItems.ts`.

## Sub-cut C — S35 admin-editable crossing map

- **Durable `CrossingMap` table** (migration 054): `PgFieldDefinitionId × AiFieldDefinitionId` + option-
  correspondence JSON + `Status` (Proposed→Confirmed); `CreatedBy/At` ARE the proposed audit, plus
  `ConfirmedByUserId/At`. One-to-one enforced by unique-filtered indexes per side. `usp_GetCrossingMap`
  now **UNIONs** the seeded immutable pairs (`Status='Seeded'`, id null) with durable rows.
- **Procs:** `usp_ProposeCrossingMap` (guards 50080–50085: existence/retired, derived-or-platform-defined,
  type-mismatch, direction PG→AI, one-to-one, option-set), `usp_ConfirmCrossingMap` (50086 not-proposable,
  50087 field-retired), `usp_GetCrossingCandidates` (mappable fields per side for the propose form). The
  **retirement guard** deferred by slice 3's `usp_RetireFieldDefinition` now fires (50014) when a live
  mapping references the field.
- **Type-compat = exact `FieldType` match.** Option-set check runs when an option map is supplied; the R1
  propose form proposes same-valued select mappings (no per-option UI — a follow-up).
- **Both propose and confirm are Platform-admin-gated.** S35 lives in the Platform-admin-only nav band, so a
  distinct AI-Solutions-workspace-admin confirmer can't reach the page anyway; the two-step (propose →
  confirm) is the deliberate second action that keeps a mapping inert until confirmed. Recorded as the R1
  reading of the blueprint's "propose (PG) / confirm (AI)".
- **S35 UI** gains the propose form (`ProposeCrossingForm`, two candidate pickers), a Status column, and a
  per-Proposed-row Confirm action.

## Verification

- API + `Api.Tests` build clean (0/0). 16 crossing-map + workspaces controller unit tests pass.
- Web `tsc --noEmit` clean (0 new errors; the one pre-existing `platform-admin/api.test.ts` tuple-destructure
  error, documented since slice 20, is unchanged). All touched web suites green — RecordViews, requests,
  features, platform-admin, Table, Layout (jest-axe on every meaningfully different state).
- tSQLt authored (`test_CrossingMap.sql`, extended `test_Features.sql` / `test_usp_ProvisionWorkspace.sql` /
  `test_usp_RetireFieldDefinition.sql`); executed at the `/dev-ship` gate (no local SQL Server / tSQLt).
