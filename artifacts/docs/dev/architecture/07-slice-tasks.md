---
slice: 07-tasks
capability: On a record's Tasks & gates tab I add single tasks or apply bundle templates, capture a typed field per task, expand Notes & decisions, and mark tasks Done — tasks group by build phase with collapsible headers.
spec-section: BS §2.4 (Task object), §7.4; blueprint Tasks & gates behaviors
started: 2026-07-04T16:28:54-04:00
ended: 2026-07-04T17:28:19-04:00
duration: 00:59:25
---

# Slice 7 — Tasks

Ships the tasks section of the S4/S5 **Tasks & gates** tab (which slice 5 stubbed): phase-grouped
collapsible list, per-task check-off / Notes & decisions / inline typed-field value, and the
gray-boxed composer (Add task / Add bundle). Gates render inline within phase groups in **slice 8**.
Decisions worth recording; the rest is carried by the diff.

## Decision 1 — promote-to-request moved to slice 10 (approved at Step 3)

The slice plan listed `POST /tasks/{id}/promote-to-request` here, but Promote runs Copy
(`POST /records/{id}/copy`) and stamps a typed `related` link — both land in **slice 10**, and slice
7 only depends on 3 and 5. Building it now would duplicate slice-10 machinery or ship a half-working
endpoint. Moved to slice 10; `slice-plan.md` (§7 + §10) and `api-contracts.md` §5/§9 updated.

## Decision 2 — task-level signoff buttons are superseded by the slice-8 gate model

The prototype renders "signoff" tasks with inline Approve/Reject buttons. The reconciled
architecture models gates as **ApprovalRequests fired on stage transitions, rendered inline within
phase groups** (slice 8) — not task-level signoff. So bundle-template signoff steps (e.g. "Sign off:
accuracy meets target") are created as **plain Open tasks** in slice 7; the real gate rendering is
slice 8. `TaskBundleTemplate.TasksJson` stores only `{ title, phase }` (the prototype's per-task
`field` / `kind:'signoff'` hints are intentionally dropped on apply).

## Decision 3 — a captured typed field is attached empty on create; the value is filled inline

The prototype's composer attaches a field to a task with **no value**; the value is typed inline on
the row afterward (a PATCH). So `usp_CreateTask` stores `FieldDefinitionId` / `FieldLabel` /
`FieldType` with all value columns null (`CK_Tasks_OneFieldValue` allows zero). The API validates the
field belongs to the workspace task library and copies its label via `usp_GetTaskField` — never
trusting client field metadata. `usp_PatchTask`'s typed-field path edits **only the value columns**
(definition/label/type are fixed at capture). One deviation: the wire `TaskTypedFieldValue` union has
no empty-number member, so a freshly-captured **Number** field starts at `0` until edited.

## Decision 4 — field-as-column rollup

`usp_QueryRequests` gained a correlated subquery projecting `RepoUrl` = the first URL-type task
field value on the record (by `SortOrder`). `RequestsService.Reads.cs` maps it to the `repo` column;
`RequestsListPage` renders it as a monospace link (the existing Repo URL column, previously em-dash).

## Access (403 never 404)

Every task path resolves the caller's side of the parent Request via `usp_GetRequestByIdForUser`
(membership baked in). A forbidden or non-existent record returns null → the API answers **403**
(BS §22.6). List gates first then returns `[]` for an accessible-but-empty record. A bundle apply on
an accessible record that produces zero rows is an **unknown template → 400** (distinct from 403).

## Prototype fidelity

Built to the prototype's Tasks & gates tab: navy phase-header bars, "+ Add task" top link that
focuses the composer title input, gray-boxed tabbed composer, per-task assignee chip (shows "You" /
"A teammate" until the user directory lands in slice 12, same convention as slice 6), completed-date
chip, and the on-hold "tasks paused" banner (hold only; abandoned closure is slice 10).

## Contract additions (living docs updated)

- `api-contracts.md` §5 — added `GET /requests/{id}/tasks` and `GET /workspaces/{id}/task-bundles`;
  moved promote-to-request to §9. `slice-plan.md` §7/§10, `shared-inventory.md` (slice 7 section),
  README index. `shared/types/tasks.ts` was already complete (no change).

## Incidental fix

`tsc --noEmit` (the edit-time gate) surfaced two pre-existing `strict`-mode errors in
`web/src/shared/text/mentions.ts` (slice 6) — the automated slice-completion gate runs jest/eslint,
not `tsc`, so they had gone uncaught. Fixed with a one-line `if (!handle) continue;` guard so the
branch type-checks clean; behavior is unchanged.

## Slice-completion gate (/dev-review-and-remediate)

- **Tests** — web 483 pass, API 29 Tasks tests pass, DB 11 Tasks tSQLt pass (deployed to LocalDB + run). Lint clean, `tsc` clean, design-token conformance PASS (137 files, 0 raw literals). Playwright e2e for the tasks flows pass on real Edge.
- **DB source fix surfaced by the tSQLt run** — `usp_CreateTask` / `usp_ApplyTaskBundle` relied on the `IsDeleted` column default; the SortOrder-sequence subquery filters `IsDeleted = 0`, so a freshly-inserted task's `IsDeleted` (unset under the tSQLt fake, `NULL`) was skipped and consecutive tasks all got SortOrder 1. Fixed by setting `IsDeleted = 0` explicitly in both INSERTs — production-correct either way and makes the filter dependency explicit.
- **Web coverage** — global branch **79.05%**, within the `web-testing.md` **[78%, 80%) acceptance band** (the project's slice-5 baseline was 78.6%). Every required behaviour case is covered (loading/error/empty, jest-axe per state, check-off, add-task, add-bundle, all six typed-field kinds, paused banner). Uncovered branches are defensive/timing paths on the large components: the composer submit guards (unreachable — the button is disabled when empty), `TasksTab.focusAddTask`'s deferred-focus `setTimeout`, the `RecordDetailPage` tasks-tab wiring line (behaviour tested in `TasksTab.test`), and pre-existing slice-5 list-filter branches. Not lowered in `jest.config.ts`.
- **Design fidelity** — the full per-component pixel-diff render manifest was **deferred** (developer-approved) in favour of a genuine visual sanity check: the built S4 Tasks & gates tab and S2 Requests list were rendered (Playwright + Edge) and eyeballed against the prototype — no drift (navy phase bars, pale-fill status pills, typed-field capture, gray composer, sticky stepper all match). The token-conformance gate already proves the visual system, and e2e proves the screens render and function. A later design-fidelity pass can run the full manifest.

## Out of scope (deferred)

Gates / approvals on records (slice 8), promote-to-request (slice 10), S25 Task detail (deferred),
task preconditions UI (`Status: 'Locked'` is supported in schema + render but no slice-7 path sets a
precondition), real SLA aging (slice 21).
