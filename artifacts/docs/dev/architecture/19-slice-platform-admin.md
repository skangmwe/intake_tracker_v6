---
slice: 19-platform-admin
capability: A Platform admin manages firm-wide config — reads the crossing map, manages platform-admin/workspace-admin grants, edits the role-label catalog, provisions workspaces (API), and reads the firm-wide audit log.
spec-section: BS §4.3, §6.2, §7.2, §1.1, §12
started: 2026-07-06T11:21:32-04:00
ended: 2026-07-06T12:21:55-04:00
duration: 01:00:23
---

# Slice 19 — Platform admin (S35 · S36 · S37 · S38 API · S39)

Builds the platform-admin band. New API lives in the existing `PlatformAdmin` module (which already
owned S34's `/platform/fields` from slice 3) plus a `WorkspacesController` in the `Workspaces` module;
new web lives in `web/src/features/platform-admin`. Decisions that the diff/commit can't carry:

## Divergences from the slice-plan scope (all analyst-approved at plan confirmation)

- **No `CrossingMap` table.** The plan listed "DB tables `CrossingMap`, `RoleLabelCatalog`,
  `PlatformAdminGrant`", but `RoleLabelCatalog` (slice 4) and `PlatformAdminGrant` (slice 1) already
  exist, and the Phase-1 crossing map is **read-only**. S35 reads the seeded PG→AI pairs off
  `FieldDefinition` (`Category='Crossing'`) via **`usp_GetCrossingMap`** — the template's crossing
  fields joined to the AI Solutions field their `CrossingToFieldKey` points at, both workspaces
  resolved by `Kind` (no hard-coded seed GUIDs). This matches slice 9's `usp_GetCrossingFields` and the
  data-model note "no CrossingMap table in Phase 1". The durable table + propose/confirm is slice 24.
  Creating an empty read-only table nothing writes would be a stub (slicing.md smell test).

- **Role labels = GET + POST + PATCH + DELETE.** api-contracts §19 listed only GET/POST; blueprint S37
  requires "add / **rename** / **retire**". Added `usp_CreateRoleLabel` / `usp_RenameRoleLabel` /
  `usp_RetireRoleLabel` (the read `usp_GetRoleLabelCatalog` already existed from slice 4). Rename and
  retire are **forward-only** (BS §7.2) — the procs deliberately do **not** touch `GateApproverSlot` /
  `ApproverTeamMembership` / `ApprovalRequest`, so past sign-offs and in-flight gates keep their
  captured label string. DELETE is idempotent 204 (retiring an unknown/already-retired label is a
  no-op). api-contracts §19 reconciled to the superset.

- **`POST /workspaces` clones the PG/Dept template.** The `Workspaces` module was a README stub.
  `usp_ProvisionWorkspace` runs one transaction: create the workspace (`Kind='pg-dept'`,
  `NextSequence=0` → first record `PREFIX-00000001`) + its `PrefixRegistry` row (prefix upper-cased,
  globally unique across `Workspaces` **and** `PrefixRegistry` → `50071`/409) + the initial admin's
  `WorkspaceAdmin` membership, then clones the template's field schema — `FieldDefinition` (new ids via
  a `#Map`), then `SelectOption`/`FieldRule`/`DerivedField` re-pointed through the map, and
  `FieldRuleDependency` (keyed by workspace + field keys, so only the workspace id changes). The
  template ships **no lifecycle/stages/gates** (only the AI Solutions workspace is seeded with those),
  so a fresh PG workspace has none either — admins configure via S31. Response is a focused
  `WorkspaceProvisionResult` (`{id,name,kind,prefix}`), not the member-less `WorkspaceDto` the contract
  sketched. `GET /workspaces` is **not** built (the switcher reads `/users/me` memberships; YAGNI).
  Phase 1 = API-only (ops tooling); the S38 wizard UI is slice 24.

- **S34 already existed.** The S34 Platform field schema web page (`/platform/fields`,
  `PlatformFieldsPage`) shipped in slice 3. Slice 19 does not rebuild it — it only adds the **Platform**
  nav section (gated on `MeDto.isPlatformAdmin`, threaded `AppShell → Sidebar`) that surfaces S34
  alongside the new S35–S39 links.

- **Platform-event workspace anchor.** `AuditEntry.WorkspaceId` is `NOT NULL`, so firm-wide config
  events need a workspace. Following the `PlatformFieldService` (slice 3) convention, role-label and
  grant events (`role-label.created|renamed|retired`, `platform-admin.granted|revoked`) anchor on the
  AI Solutions workspace id; `workspace.provisioned` anchors on the **new** workspace. All land in the
  firm-wide audit (S39), which spans every workspace.

## Reuse / smaller decisions

- **Firm-wide audit** (`usp_QueryFirmWideAudit` + `FirmWideAuditService`) mirrors slice-18's
  `usp_QueryWorkspaceAudit`/`AuditService` (raw ADO.NET, two result sets) but drops the workspace
  filter to a nullable narrower and adds `WorkspaceName` per row. There is **no actor filter** on the
  S39 web bar — R1 has no firm-wide user directory to populate an actor picker (the workspace bar
  sources actors from the member list; no such single list firm-wide).
- **Audit-feature exports promoted.** `eventGroup` / `eventTypeLabel` / `EVENT_TYPE_OPTIONS` /
  `EventGroup` were promoted to `@/features/audit`'s barrel (they were internal to slice 18) so the
  firm-wide table + filter bar compose the same event-pill vocabulary (web-file-structure.md — a second
  consumer goes through the barrel).
- **Email-resolve grant.** `usp_UpsertPlatformAdminGrant` resolves a typed email/display-name to a real
  active user (unresolved `50020` / ambiguous `50021` → 400), mirroring `usp_UpsertWorkspaceMembership`
  — R1 has no user-directory endpoint. WorkspaceAdmin rows in the S36 directory are read-only (membership
  changes stay in S29 / the Users module).

## Verification

- API (`Api.csproj` + `Api.Tests.csproj`) build clean (0 warnings/errors); 5 new controller test classes
  (happy / 403-not-admin / outcome branches / cancellation).
- Web `tsc --noEmit` clean for all new files; 40 jest tests pass across 7 suites (api, hook, 4 pages,
  Sidebar), jest-axe on every meaningfully different state. Playwright `platform-admin.spec.ts` added.
- The 13 pre-existing `tsc` test-file errors (slices 6/8/11/12) are unchanged; 0 new.
