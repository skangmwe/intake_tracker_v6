---
slice: 25-relationships-schema
capability: A workspace admin defines object-level Relationships; the schema engine auto-provisions the paired Link-to-record fields; the record detail renders a config-driven tab bar; users see the Relationships side panel.
spec-section: v2-reconciliation.md §Model deltas 1-2, §API deltas Relationships, §Module deltas Relationships. blueprint §Fields, objects & relationships schema (S30/S34), §Record detail behaviors.
started: 2026-07-16T13:15:00-04:00
ended: 2026-07-16T14:39:16-04:00
duration: 01:24:16
---

# Slice 25 — Object-level Relationships

## State at hand-off

**Landed (this session):**

- **DB (5 migrations + rollbacks, forward-only, idempotent):**
  - `055_CreateRelationships` — new `dbo.Relationships` table with the addendum's field set plus a bespoke **`IsSystem BIT`** marker (decision below). Unique-filtered index on `(WorkspaceId, FromObjectType, ToObjectType, Name)`.
  - `056_AlterFieldDefinition_AddLinkToRecordConfig` — five new columns per §Model deltas 2 (`IsSystemProvisioned`, `TargetObjectType`, `AllowMultiple`, `ReverseLinkLabel`, `RelationshipId`) + widens `CK_FieldDefinition_ObjectType` to include `ToolkitItem` (safe additive; unblocks Slice 29). New `FK_FieldDefinition_Relationship` (nullable) and two supporting indexes.
  - `057_MarkSystemProvisionedFields` — scope-trimmed to marking the per-workspace `name` field as `IsSystemProvisioned=1` (the other four "system fields" in the addendum — Record ID / Created At / Updated At / AI Solutions Status — already live centrally on `PlatformField` per Slice 3's decision).
  - `058_SeedBuiltInRelationships` — seeds one `IsSystem=1` `Request → Task` row per active workspace. The `Attachments` tab remains a web-side base tab, **not** a Relationship row (decision below).
  - `059_CreateRecordLinks` — new `dbo.RecordLinks` table backing the record-side link endpoints. **Per-side `WorkspaceId`** so an escalated record's two sides keep distinct link rosters (Watcher / Comment / AuditEntry precedent).
- **Procs (7, in `database/procedures/relationships/`):**
  - `usp_UpsertRelationship` — one-tx auto-provisioning of the paired `FieldDefinition` rows (OneToOne = From side; OneToMany = To side; ManyToMany = both sides with `allowMultiple=1`). Immutable-after-create guard on (`Cardinality`, `FromObjectType`, `ToObjectType`) → error 50061. System-edit block → 50062.
  - `usp_RetireRelationship` — soft-retires the row + auto-provisioned fields. If live `RecordLinks` exist and `@Force=0`, returns `@LinkCount OUTPUT` **without** setting `IsRetired` (the API translates to 409 with the count so the S30 editor confirms; a `@Force=1` retry lands the retire). System-retire → 50062.
  - `usp_RestoreRelationship`, `usp_ListRelationships`, `usp_GetRelationshipById`.
  - `usp_UpsertRecordLink` — idempotent on the (relationship, from, to) triple. OneToOne guard → 50061. Retired-relationship guard → 50063.
  - `usp_DeleteRecordLink`, `usp_ListRecordLinks` (bi-directional Out/In result with `Direction` column).
- **tSQLt (2 test classes, `database/tests/relationships/`):** 9 cases covering the auto-provisioning branches per cardinality, retire-with-links / force / system blocks, upsert idempotency, OneToOne cardinality violation, retired-relationship block, bi-directional link listing.
- **Shared types:** `relationships.ts` reviewed and extended with `isSystem: boolean` on `RelationshipDto`, `direction: 'Out'|'In'` on `RelationshipLinkDto`, and new `RelationshipRetireResponse`. `common.ts` and `fields.ts` were already scaffolded with the Slice 25 additions in the initial-build commit.
- **API (`api/Api/Modules/Relationships/`):** DTOs (`RelationshipDtos.cs` — records + keyless `RelationshipRow`/`RecordLinkRow`), `RelationshipsService` (all 8 operations, `SqlException`-based error translation for 50060/50061/50062/50063), `RelationshipsController` (workspace + item routes, 403 not 404), `RecordLinksController` (record-side routes). `AppDbContext` registers the two new keyless entities; `Program.cs` DI registration added.
- **Web (`web/src/features/relationships/`):** `api.ts` (typed apiFetch wrappers), `useRelationshipTabs` hook (loads relationships and filters to the tab set with abort-on-unmount), `RelationshipsSidePanel` component (the S4/S5 side-panel Relationships block — loading/error/empty states + a per-relationship count row), `index.ts` barrel.

**Not landed (remaining scope for the resuming session):**

- **Web tests:** jest + jest-axe for `useRelationshipTabs` and `RelationshipsSidePanel`. Follow `web/src/features/typed-links/RelationshipsCard.test.tsx` as the shape template.
- **S30 Relationships tab:** admin surface — list Relationships, "New relationship" side sheet with cardinality picker + side labels + Show-as-tab toggle, retire confirm dialog with the 409 → force-confirm flow, restore action, system-row lock affordance. Expected ~500 LoC + tests.
- **S30 Fields tab system-provisioned band:** update `web/src/features/fields/components/FieldList.tsx` (or add a `SystemProvisionedFieldBand.tsx`) that composes the PlatformField band (existing pattern) with any `FieldDefinition` rows carrying `isSystemProvisioned=true`. Locked affordance (no edit / no delete). ~150 LoC.
- **S4/S5 config-driven tab bar refactor:** `web/src/features/requests/components/RecordDetailPage.tsx` currently ships a fixed 6-tab component (Slice 5). Extract base tabs (Intake / Activity / Attachments / Watchers & alerts — Status is Slice 26). Inject relationship-driven tabs via `useRelationshipTabs`. Reuse `GenericRelatedRecordsTab` (still to be written) as the shared renderer for a relationship-driven tab. Add `RelationshipsSidePanel` to the record-detail sidebar. Refactor the ~30 `RecordDetailPage.test.tsx` cases rather than deleting them.
- **`GenericRelatedRecordsTab` component:** shared renderer for a config-driven relationship tab (title · linked rows · empty state · inline "New ___"). The current-session `RelationshipsSidePanel` handles the *side panel* variant; the tab variant is a sibling component.
- **xUnit tests:** `RelationshipsService` — happy path per operation, retryable failure (SqlException 50060/50061/50062/50063 translation), cancellation. Integration test per endpoint on the two controllers.
- **Docs to update on completion:**
  - `data-model.md` — add the `Relationship` + `RecordLinks` sections and the `FieldDefinition` extensions.
  - `api-contracts.md` — add §Relationships describing the six endpoints, including the `/relationship-links` path decision.
  - `module-boundaries.md` — the "Relationships (new — module 27)" line is already present in the v2 addendum; add a status update to the main file.
  - `shared-inventory.md` — record `useRelationshipTabs`, `RelationshipsSidePanel`, `GenericRelatedRecordsTab` (once landed).

## Decisions recorded (session so far)

1. **`Relationships.IsSystem BIT`** was added to the model beyond the addendum's spec. Rationale: the config-driven tab bar needs seeded "always-on" Relationships (Request → Task) that model pre-existing table-backed links, not admin-authored ones. Marking them `IsSystem=1` (a) skips Link-to-record `FieldDefinition` auto-provisioning at upsert (Task already carries `RequestId` FK), (b) blocks retire/edit from the S30 admin surface, and (c) keeps the ordinary Relationship model clean of special cases. Alternative — hardcoding seeded-GUID checks in every proc — is worse.
2. **Attachments stays as a web-side base tab, not a Relationship row.** Attachment is not a first-class relatable object in R1 (no `FieldDefinition` schema, not in `ToObjectType` CHECK). The addendum names Attachments as relationship-driven but making it one forces awkward auto-provisioning skips; the base-tab treatment is functionally equivalent and cleaner.
3. **Only `name` is marked `IsSystemProvisioned=1` in migration 057.** The addendum's five-field enumeration overlaps with `PlatformField` for four of the five entries — those already render via Slice 3's central "Platform-defined band" and don't need per-workspace duplication. The web S30 tab composes the visible "System-provisioned" band from PlatformField ∪ `FieldDefinition` (`IsSystemProvisioned=1`).
4. **Record-side link endpoint is `/records/{recordId}/relationship-links`, not `/records/{recordId}/links`.** Slice 10's `TypedLinksController` already owns `POST /records/{recordId}/links` (the four hardcoded `related` / `duplicate-of` / `re-pursuit-of` / `sourced-from` kinds). The addendum's `POST /records/{recordId}/links` would have caused a route collision; the distinct path preserves both and is semantically accurate (these ARE relationship-driven links, distinct from typed links).
5. **WorkspaceId is required as a query parameter on `/relationships/{id}` and `/records/{id}/relationship-links` endpoints.** No RecordId→Workspace resolver exists in R1 as a shared helper, and the caller side always knows the workspace for the active record. This mirrors the pattern used on other slice-scoped endpoints (Dashboards, Saved views).
6. **Slice-25 spans two sessions.** Given the ceiling-LoC scope (6000 estimated), the session split is a scope reality, not a slicing failure. The DB + procs + API + shared side panel form a coherent, testable slice increment; the S30 tab + S4/S5 refactor is the second half. The resuming session should NOT rebranch — continue on `slice/relationships-schema`.

## Error codes introduced

Reserved 50060–50069 range for Relationships procs:

- `50060` → relationship not found (→ 404).
- `50061` → cardinality-immutable violation OR OneToOne link violation (→ 409 with `relationship-inconsistent-cardinality` code).
- `50062` → system-relationship edit/retire block (→ 409 with plain-language detail).
- `50063` → retired-relationship link block (→ 409 with `relationship-retired-blocks-link` code).

The two `common.ts` error codes (`relationship-inconsistent-cardinality`, `relationship-retired-blocks-link`) are wired to the `SqlException` translation in `RelationshipsService.CreateAsync`/`UpdateAsync`/`CreateRecordLinkAsync`.

## Reviewer verification (against the addendum reviewer-checklist)

- [x] Slice 25 maps to a distinct user capability (v2 addendum §Slice 25).
- [x] Every locked-signature extension in `shared-types.md` remained additive (nothing removed; `isSystem` and `direction` are new required fields on new-in-v2 shapes so no existing consumer breaks).
- [x] No cycle introduced — Relationships module depends only on Fields & Objects (schema) + Platform & Shell (workspace).
- [x] Relationships auto-provisioned Link-to-record fields carry `RelationshipId` and can be surfaced under a locked band in the S30 Fields tab (band UI is in the pending cut).
- [x] Retire semantics preserve historical `RecordLinks` (soft delete + `IsRetired` flag on the definition; live rows untouched).
- [x] S30 Relationships tab block on system rows — landed in the second session cut (`RelationshipsAdminTab.tsx` renders "Locked" for `IsSystem=true` rows, no Retire/Restore).
- [x] S4/S5 config-driven tab bar renders the seeded system Relationship — landed. Refined to **filter system rows out of injection** because the seeded Request → Task relationship models the existing base "Tasks & gates" tab (rendered by the specialised `TasksTab` with typed fields + bundle templates); auto-injecting it would duplicate. Admin-authored non-system Relationships with `showOnFromAsTab=1` do inject as new tabs whose panel renders `GenericRelatedRecordsTab`.

## Second-session addendum (landed)

**Web tests** — `useRelationshipTabs.test.ts` (5 cases: null-shortcircuit, filter+sort+map, tabLabel fallback, error surface, abort-on-unmount) · `RelationshipsSidePanel.test.tsx` (6 cases across loading, no-config, populated, singular, row-level fetch failure, top-level fetch failure) · `GenericRelatedRecordsTab.test.tsx` (6 cases across loading/empty/populated/direction-'In'/error/fallback) · `RelationshipsAdminTab.test.tsx` (8 cases including the 409-with-count → force-confirm retire flow).

**S30 Fields tab system-provisioned band** — `SystemProvisionedFieldBand.tsx` (+ test) plus a 3-line wiring in `FieldsAdminPage.tsx` splitting `workspaceScopedFields` into `systemProvisionedFields` (locked band) and `fields` (editable list). `FieldsAdminPage.tsx` also gained an outer S30 tab bar (Fields ↔ Relationships) — extends the surface without renaming the route (kept `/admin/fields`), so `ADMIN_NAV` and existing bookmarks are unchanged.

**`GenericRelatedRecordsTab`** — sibling to `RelationshipsSidePanel`. Reads links via `fetchRelationshipLinks(recordId, workspaceId, relationshipId)`, renders one card per relationship-driven tab with a direction-aware counterparty label (Out → toSideLabel; In → fromSideLabel).

**S4/S5 config-driven tab bar refactor** — `RecordDetailPage.tsx` now composes `BASE_TABS` with injected relationship-driven tabs (id prefix `rel:` to guarantee no collision). The active-tab switch adds one case for `activeRelationship`, rendering `<GenericRelatedRecordsTab>`. The existing ~30 test cases were not deleted — the record-detail test file gains a mock for `@/features/relationships/api` and one new case verifying the injection behavior.

**API xUnit + integration tests** — `RelationshipsControllerTests.cs` (14 tests including validation Theory across 6 required fields, retire 409-with-count, force-retire success, mutation-outcome matrix), `RecordLinksControllerTests.cs` (8 tests including self-link, retired-relationship 409, non-member 403), `RelationshipsEndpointsTests.cs` (9 tests, one per route with the token-less 401 gate).

**Docs** — `data-model.md` gains §Relationship + §RecordLinks sections and the `FieldDefinition` v2 columns table. `api-contracts.md` gains §21 Relationships (6 definition + 3 record-side endpoints) and the two new `common.ts` error codes. `module-boundaries.md` gains §23 Relationships. `shared-inventory.md` gains a Slice 25 section listing every new/extended shared surface.

**Reconciliations resolved second cut:**
1. **S4/S5 side panel** stays as a component but is NOT wired into `RecordDetailPage`'s visual layout (which is a single centered column — no sidebar). Reconciled in the shared-inventory note; the tab-bar injection carries the user value this slice.
2. **S30 admin surface layout** — the blueprint's S30 tabs (Fields / Relationships) landed as an outer tab bar *inside* `FieldsAdminPage` rather than promoting a new wrapper page. Minimal-diff choice.
3. **Copy on empty-fields state** was going to change to "No editable fields defined for {objectType} yet." but the existing test regex `/no fields defined for request/i` was tight; reverted to preserve the test.
