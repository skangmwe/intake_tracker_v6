---
slice: 14-feature-catalog-saved-views
capability: Browse/detail/harvest the Feature Catalog (S9/S10/S13) and author saved views via a tabbed side sheet (S24, wired into S9 + S2)
spec-section: BS §2.5, §18, §22.3-22.4
started: 2026-07-05T15:20:38-04:00
ended: 2026-07-05T16:53:45-04:00
duration: 01:33:07
---

Decisions and non-obvious points worth carrying forward. Layers changed and the file list are in `git log --stat`.

## Decisions

1. **Add-to-catalog is a service, not a stored proc.** It mirrors `CopyService` (slice 10) exactly: reads the source Request access-gated via `IRequestsService.GetByIdAsync`, builds a `Feature`-typed Draft prefilled by same-field-identity (name → draft title, techStack, solutionPattern, repoUrl) via `usp_SaveDraft`, and queues a `sourced-from` link. The link is stamped from the newly-minted feature at submission by `usp_CreateFeature @QueuedLinksJson`. No `usp_AddToCatalog` proc — this is the "prefill-plus-link-plus-button" pattern the spec (§237) says reuses the Task→Request promotion machinery.

2. **`POST /features/query`, not the contract's `GET /features/query`.** The api-contracts §11 draft said `GET /query` with a body; every other list uses the established `POST …/query` body convention (requests/notifications/announcements) per api/CLAUDE.md ("no complex params in query strings"). Corrected in api-contracts.md. `FeatureListQuery` = `PaginatedQuery` (the "same shape as RequestListQuery" note — Requests query uses `PaginatedQuery`).

3. **`objectType` added to the SavedView model.** The `data-model` entity map listed SavedView but not its columns; the shared `SavedViewDto`/`SavedViewUpsertRequest` (in `notifications.ts`) had no object-type discriminator. A saved view must bind to one list surface (a Request view must not appear on the Feature picker), so a `SavedViewObjectType` (`Request|Feature|Task|Announcement`) column + `?objectType=` list param + body field were added. `ownerUserId` was also surfaced on the DTO. Reused the existing types in place rather than creating a new `saved-views.ts`.

4. **Feature list access = AI-workspace Viewer+.** Features are hub-local; `usp_QueryFeatures` trusts the workspace scope (resolved server-side by `Kind='ai-solutions'`), and the service gates the caller on Viewer+ of that workspace (`FeaturesService.QueryAsync` returns null → controller 403). Firm-wide read-only access to Published features (Dashboard-viewer, BS §10.4) is **slice 23** — not wired here.

5. **S24 editor wired into both S9 and S2, but with different view models.** The editor (`SavedViewEditor`) is self-contained (given a workspace + objectType + columns, it creates/edits a real `SavedView`). S9 shows a client `Published catalog` preset + real Feature saved views; S2 keeps its client presets (`Unassigned`/`Due this week`/`My requests`) and **merges** real Request saved views alongside them. Selecting a real view applies its `filters` + first `sort`; the picker's three footer actions (Modify columns / Edit this view / Save as new view) open the editor on the Fields / Filters tab or in create mode. Kept the S2 presets to avoid destabilising the existing surface (the `SavedView` table seeds empty).

6. **S10 reuses the Attachments + Relationships cards.** Rather than build feature-specific attachment/link UI, S10 embeds the shared `AttachmentsCard` (visuals, BS §18.6) and `RelationshipsCard` (the `sourced-from` provenance) keyed by the feature's record id — both are record-agnostic. `FeatureDto.sourcedFromRecordIds` is still populated server-side (from the feature's `sourced-from` typed links) for completeness.

7. **Gallery toggle: disabled stub with tooltip** (analyst decision). S9 renders the "Gallery view" toggle disabled with a "arrives in a later iteration" tooltip — S11 Feature gallery is slice 24. Honest about the deferral without dead navigation.

8. **Shared-type refinements.** `FeatureCreateRequest.owner` made optional (a stand-alone feature may have no owner; the API DTO already accepted it optional). `FeatureDto.eTag` added (the API returns it; a future feature-edit form needs it for optimistic concurrency — S10 currently only publishes/deprecates, which don't).

## Storage model

`Features` mirrors `Requests`: a `FieldValues` JSON map with `Name`/`Maturity` promoted to real columns and `OneLiner`/`FeatureType`/`OwnerUserId` projected as PERSISTED computed columns for the S9 covering index. Minted from the AI workspace's own prefix/sequence (object type, not prefix, distinguishes a feature). `SavedView` stores columns/filters/sort as opaque JSON; `IsDefault` is per (owner, workspace, objectType) — the upsert proc clears the prior default on set.

## Deferred / out of scope (per the plan)

S11 Feature gallery → slice 24. S12 Feature dashboard → slice 23. Export-view button → slice 16. Dashboard records-grid embedding → slice 23. Per-view live counts on the picker (only the active view shows its count).
