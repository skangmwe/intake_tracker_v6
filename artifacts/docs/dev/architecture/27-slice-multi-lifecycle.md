---
slice: 27-multi-lifecycle
capability: a workspace admin defines multiple lifecycles via the S31 dropdown selector (one default); the S3 intake form shows a Lifecycle picker (hidden when only one exists); a submitted request runs on the chosen lifecycle for its whole life
spec-section: v2-reconciliation.md §Model deltas 4 + §API deltas Multi-lifecycle; blueprint S31 / S3; api-contracts §3 + §18
started: 2026-07-18T23:40:24-04:00
ended: 2026-07-19T00:04:41-04:00
duration: 00:24:17
---

# Slice 27 — Multiple lifecycles + Lifecycle picker at intake

Mostly **reconciliation**, not net-new infrastructure. Slice 4 shipped the multi-lifecycle DB
(`IsDefault` + filtered unique index) and a working S31; slice 5 shipped `Requests.LifecycleId` (FK,
NOT NULL) and a create service that already resolves+defaults a lifecycle, plus an intake picker. So
slice 27 added **no migration** and no new table — it made the lifecycle a first-class intake choice,
reconciled S31/S3 to the v2 prototype, and added one thin read endpoint.

Layers touched: shared types (`gates.ts` `LifecycleSummaryDto`, `requests.ts`
`RequestCreateRequest.lifecycleId?`) · API (`Modules/Lifecycle` list endpoint + `GetSummariesAsync` +
pure `MapSummaries`; `Modules/Requests` `RequestCreateRequest.LifecycleId` + pure `ResolveLifecycle`) ·
web (`features/lifecycle` dropdown rework + `fetchWorkspaceLifecycles`/`useWorkspaceLifecycles`;
`features/requests` intake picker) · tests (xUnit + jest/jest-axe + Playwright + e2e mocks).

API + Api.Tests build **0 warnings / 0 errors**. Web `tsc`/`jest`/Playwright are authored here and run
at the ship gate (`/dev-review-and-remediate`) — the worktree has no local `node_modules`
(slices 15/16/21/23 precedent).

## Decisions (4 analyst-approved at plan-confirmation, + supporting)

1. **D1 — the lifecycle `Name` is the single label; no `DisplayLabel` column.** The v2 reconciliation
   addendum sketched a new `DisplayLabel nvarchar(80)`. The prototype (authoritative for S31/S3) uses
   only the lifecycle **`name`**, so `Name` serves that role. `RequestType` is retained (NOT NULL, no
   migration) but **deprecated as a user concept** — the S31 editor drops its input and `draftToRequest`
   **mirrors `requestType` from `name`** on save, keeping the column populated and the legacy CSV-import
   request-type match resolving by the label. Contracts updated: `data-model.md` Lifecycle table,
   `v2-reconciliation.md` §Model deltas 4.

2. **D2 — only the read-side `GET /workspaces/{id}/lifecycles` was built; the granular
   POST/PATCH/set-default endpoints were skipped.** Slice 4's `PATCH /workspaces/{id}/lifecycle`
   full-config reconcile already performs create / rename / set-default / remove atomically, and the S31
   dropdown reuses it, so building granular duplicates would violate the no-redundant-machinery rule. The
   list endpoint reuses the **existing** `usp_GetWorkspaceLifecycles` (no new proc). Contract updated:
   `api-contracts.md §18`, `v2-reconciliation.md §API deltas Multi-lifecycle`.

3. **D3 — intake moves to a first-class `lifecycleId`, with `fields.requestType` as fallback.**
   `RequestsService.ResolveLifecycle(lifecycles, explicitLifecycleId?, requestType?)` precedence:
   explicit id (must resolve within the workspace list) → legacy request-type string → workspace default
   → first. The `lifecycles` list is workspace-scoped, so a foreign id simply falls through — a request
   can **never** bind to another workspace's lifecycle. The intake form sends `lifecycleId` whenever a
   lifecycle resolves (even when the picker is hidden), so the record lands deterministically.

4. **D4 — the PG/Dept template's missing seeded lifecycle is out of scope.** Only the AI Solutions
   workspace has a seeded lifecycle (slice 4). PG records arrive via escalation / Copy from the AI side,
   and the template intentionally seeds "no stages", so no PG lifecycle seed was added. Flagged for
   awareness; a separate change if direct PG-workspace intake is ever required.

## Prototype fidelity (S31, S3)

- **S31 selector: chip bar → `<select>` dropdown** (prototype `AI Solutions Tracker.dc.html` lines
  1926–1947) — "New lifecycle" button, options `name (+ " (default)")`, editable **Lifecycle name**
  input, "Default lifecycle" star / "Make default" action, and a trash **remove shown only when
  `>1` lifecycle AND not the default** (you set another default first). Approver-teams block unchanged
  (the "move to Users & access" reference is a listed v2 amendment against slice 2/17, not this slice).
- **S3 picker: "Request type" → "Lifecycle"** (prototype line 435, hint "Sets the stages and approval
  gates this request will follow"), options are lifecycle **names**, **hidden when the workspace has one
  lifecycle**, submit writes `lifecycleId`.

## Verified, not rebuilt

"A request runs on its chosen lifecycle for its whole life" is already enforced: `usp_SetRequestStage`
reads `@LifecycleId` off the record and validates the target stage against `StageDefinition WHERE
LifecycleId = @LifecycleId`; no PATCH path mutates `Requests.LifecycleId`.
