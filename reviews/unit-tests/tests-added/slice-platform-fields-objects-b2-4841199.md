# slice-platform-fields-objects-b2-4841199 — tests added / extended

**Scope:** platform Fields & objects — Objects + Relationships tabs (B2). API + Frontend.

## Iteration 1

Tests authored during the slice (`/dev-build-application` equivalent) and run in Phase 0. No gap-fills required — every required case per `api-testing-guidelines.md` and `web-testing.md` was already present.

### API (xUnit) — `api/Api.Tests`

- `PlatformSchemaControllerTests.cs` (new, 8 cases): each endpoint's admin happy-path + non-admin 403; `GetRelationships` missing-workspaceId 400 and cancellation propagation. Verifies delegation to the reused services.
- `ObjectSchemaServiceTests.cs` (extended, +1 case): `GetGlobalSystemObjects_ReturnsRequestAndTaskOnly_ReadOnlyReferenceNoCounts` — pure composer returns the two Global built-ins with no workspace, no counts, `IsSystem=true`.

Run: `dotnet test Api.Tests` → **710 passed / 0 failed**.

### Frontend (Jest + jest-axe) — `web/src/features/fields`

- `platformSchema.test.ts` (new): the three fetch wrappers build the correct URL; abort signal forwarded.
- `usePlatformSchema.test.tsx` (new): enable/disable gating for objects/workspaces/relationships hooks; relationships query key namespacing.
- `components/PlatformObjectsTab.test.tsx` (new): data / loading / error / empty, read-only (no editor/New), axe each state.
- `components/PlatformRelationshipsTab.test.tsx` (new): workspaces loading/error/empty, relationships loading/error/empty, data render + System/Retired/Active badges, workspace-picker re-scoping, axe.
- `components/PlatformFieldsCatalogTab.test.tsx` (new): the B1 catalog behavior, retargeted to the extracted tab (render/loading/error/empty, read-only sheet, edit + update-failure, axe).
- `components/PlatformFieldsPage.test.tsx` (rewritten): 3-tab shell — no-access + fetches-nothing, default Fields tab, switch to Objects, switch to Relationships, axe.

Run: `jest src/features/fields` → **139 passed**; full `test:coverage` → **1461 passed**, branches 79.93% (within the tolerated [78,80) band per `web-testing.md`; the one uncovered branch is `PlatformFieldsPage`'s `isMeLoading` early-return — a defensive guard).
