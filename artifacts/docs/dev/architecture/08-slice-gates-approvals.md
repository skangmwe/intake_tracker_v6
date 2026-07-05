---
slice: 08-gates-approvals
capability: When a stage advance fires a gate, I see the pending gate inline within its target phase group on the Tasks & gates tab; a team member picks their name and approves or rejects (rejection requires a comment); a rejected slot creates a re-review row and the gate stays open until every slot is approved, at which point the record advances.
spec-section: BS §7.2 (Approval gates), §7.3 (sign-off channel); api-contracts.md §6; Requirements Use Case 2
started: 2026-07-04T18:48:41-04:00
ended: 2026-07-04T19:54:38-04:00
duration: 01:05:57
---

# Slice 8 — Gates on records + Approvals

Ships the gate section of the S4/S5 **Tasks & gates** tab (which slice 7 stubbed): a stage advance
through a gated transition opens an `ApprovalRequest`; the gate renders inline within its target phase
group; a team member picks their name and approves/rejects; the record advances only once every slot
is signed. Decisions worth recording; the rest is carried by the diff.

## Decision 1 — gate opening folds into `POST /requests/{id}/stage` (no separate open endpoint)

The prototype (and BS §7.2) fires a gate *on a stage advance*, so there is no user-facing "open a
gate" action. `RequestsService.SetStageAsync` now consults `IApprovalsService.FindGateForTransitionAsync`
first: an **ungated** transition advances as before (`usp_SetRequestStage` → `{advanced:true, newStage}`);
a **gated** transition opens the gate (`usp_OpenGate`) and returns `{advanced:false, gateOpened}`; a second
attempt while a gate is open returns **409 `gate-already-open`**. This is a one-directional dependency
(Requests → Approvals — Approvals never calls back into Requests, so no DI cycle). `StageTransitionResultDto`
was extended to the discriminated `{ advanced, newStage?, gateOpened? }` union (null members omitted via
`JsonIgnore`) to match `StageTransitionResult` in `requests.ts`. `api-contracts.md §6` updated; a new
`GET /requests/{id}/approval-requests` was added so the tab can read the record's gates (the reconciled
contract had no read endpoint).

## Decision 2 — re-request is an explicit endpoint, not the prototype's session-only inline re-review

The prototype's S7 gate block renders inline re-review inputs directly after a rejection (a session-only
UI). The **reconciled durable contract** (`data-model.md §ApprovalDecision`, `api-contracts.md §6`)
defines `POST /approval-requests/{id}/re-request` as the mechanism: a rejected slot shows the rejection
line + comment + a **"Re-request approval"** button; clicking it supersedes the live rejection (returning
the slot to pending) and the name-picker re-appears. History is retained — a superseded rejection stays
visible under a disclosure toggle. Implemented per the durable contract (prototype-vs-contract: the
authoritative reconciled contract wins here because the prototype's flow was explicitly persisted only
per-session). The "current decision per slot" is modelled with a **`SupersededAt` column** (a new decision
or a re-request supersedes the prior live row → at most one live decision per slot), rather than
latest-`DecidedAt`, so the supersede semantics are explicit and append-only.

## Decision 3 — the frozen approver set carries member names; the empty roster is the correct data state

`FrozenApproverSlot.eligibleUserIds: UserId[]` was replaced with `eligibleMembers: ApproverTeamMemberDto[]`
(userId + displayName) and `ApprovalDecisionDto` gained `decidedByName` + `superseded`. Reason: the
"Select your name" dropdown and the "Approved/Rejected · signer · date" lines need display names, and the
user directory does not land until slice 12 — so the names are **snapshotted at gate-open** (they already
render in the S31 approver roster, so this is consistent with how the app surfaces those names). Slice 4
seeded `ApproverTeamMembership` **empty** (no-invented-facts rule), so a freshly opened gate freezes an
**empty eligible set**: the gate opens and blocks the stage, but no slot can be signed until a workspace
admin adds team members in S31. The gate block renders a "No eligible approvers yet — add members in
Lifecycle & gates" note in that state. This is the correct data state, not a defect — the mechanism is
complete and demonstrable once a roster exists. Home "Needs your decision" surfacing is slice 22 (no Home
surface yet); the gate's `Pending`/`ChangesRequested` state is the data that panel will later read.

## Access (403 never 404) + level

Every gate path resolves the caller's side of the record via `usp_GetRequestByIdForUser` (read) or a
membership join inside each write proc (`usp_OpenGate` / `usp_SubmitDecision` / `usp_ReRequestApproval`).
A forbidden or non-existent record returns null / no rows → the API answers **403** (BS §22.6). Level:
reads are Viewer+; a decision / re-request is **Member+** (proc join `Level IN ('Member','WorkspaceAdmin')`);
a **proxy** decision is **WorkspaceAdmin** (`m.Level = 'WorkspaceAdmin'` when `@IsProxy = 1`). Eligibility of
the *signer* (must be in the frozen set AND a current team member) is a separate, in-proc check — the
model does not require caller == signer (the acting member picks their own name, per BS §7.2). Rejection
requires a comment at the API (`400 rejection-requires-comment`) **and** the DB `CK` as a backstop.

## Contract & schema additions (living docs updated)

- `data-model.md` — Slice 8 build notes on `ApprovalRequest` / `ApprovalDecision` (per-side WorkspaceId,
  frozen transition keys+labels, filtered UNIQUE "one open gate per record", `SupersededAt` model,
  `vw_ApprovalRequestDetail`).
- `api-contracts.md §6` — added the GET read, the gate-opening-via-stage note, the `not-eligible` /
  `unknown-slot` / `gate-already-resolved` error codes.
- `shared/types/gates.ts` — `FrozenApproverSlot.eligibleMembers`, `ApprovalDecisionDto.decidedByName` +
  `superseded`. `shared-types.md`, `shared-inventory.md`, `slice-plan.md §8`, README index updated.

## Layers touched

Database (2 migrations 036–037 + rollbacks · 1 view + 5 procs in `gates/` · 1 tSQLt suite — 13 tests) ·
Shared types (`gates.ts`) · API (`Modules/Gates` service/controller/DTOs; `RequestsService.SetStageAsync`
wired; `StageTransitionResultDto` extended; 2 keyless projections + DI) · API tests (xUnit: controller
outcome-mapping + `ParseJson` helper — 17 pass) · Web (`features/gates`: api, hooks, `GateBlock`,
`GateSlot`, `gateView`, `gates.css`, barrel; `features/tasks/TaskGroup` extracted; `TasksTab` merges
gates into phase groups; `useSetStage` + Status-tab note; `buildApprovalRequest` in test-utils) · Web
tests (jest + jest-axe across gate states + interactions; Playwright `gates.spec.ts` — approve→resolve,
reject→re-request).

## Incidental fix

The edit-time `tsc --noEmit` gate surfaced a pre-existing `exactOptionalPropertyTypes` error in
`TaskRow.test.tsx` (`buildTask({ assignee: undefined })`) — the slice-completion gate runs jest/eslint,
not `tsc`, so it had gone uncaught (same class as slice 7's mentions.ts fix). Fixed by building the
unassigned task with `assignee` omitted rather than set to `undefined`; behaviour unchanged.

## Slice-completion gate (`/dev-review-and-remediate`)

- **Web (Phase 0)** — `npm run test:coverage`: **507 tests pass** (93 suites). Global branch coverage
  **79.24%** — within the `web-testing.md` **[78%, 80%) acceptance band** (slice-5 baseline 78.6%,
  slice-7 79.05%; this slice nudged it up); statements 89.15% / functions 85.4% / lines 90.31% all ≥85%.
  The gate feature itself is **90%+ covered** (GateBlock/GateSlot/useGates ~100%). Uncovered branches are
  the same pre-existing large list/detail edge handlers documented in slices 5/7, plus a couple of
  defensive gate paths (`api.ts` signal ternary, `GateSlot` disabled edges). `tsc --noEmit` clean,
  `eslint` clean.
- **API (Phase 0)** — `dotnet test`: **199/199 pass** once AzureAd config is supplied. The lone failure in
  a fresh worktree is the scaffold `HealthTests` smoke, which uses the bare `WebApplicationFactory` with no
  `appsettings.Development.json`; proven environmental (passes with config; every app-booting endpoint test
  already passed). The 17 gate xUnit tests + `ParseJson` helpers pass; `dotnet build` clean.
- **Database (Phase 0, real-stack)** — the tSQLt **framework** isn't vendored in the repo (so the
  `FakeTable` harness needs a CI install), so the procs were validated **against real LocalDB** instead:
  all 37 migrations + 47 proc/view files **deploy clean** (proving the nested `FOR JSON` freeze, the
  `OPENJSON` view, and every proc compile on real SQL Server), and a smoke script exercised the gate flow
  end-to-end on the seeded **3-slot** QA gate — `usp_GetGateForTransition` detect → `usp_OpenGate` freeze
  (JSON eligible-set parses, member present on every slot) → `gate-already-open` 50051 → approve all 3 →
  **Resolved + record advanced to `qa`** → blank-comment reject 50053 → reject-with-comment →
  ChangesRequested, no advance → re-request → Pending + rejection retained superseded → ineligible signer
  50057. The authored `database/tests/gates/test_Gates.sql` (13 tSQLt tests) runs in CI where the framework
  is installed.
- **Design-conformance (Phase 1)** — PASS on all changed files (tokens-only, no inline styles, no raw
  hex/rgb/radii). The hook itself hangs in this Windows Git-Bash shell on its process-substitution loops,
  so its exact grep checks were run directly; pre-existing files were already conformance-clean.
- **Code review (Phase 1) + Security review (Phase 2)** — no Critical/High findings. Parameterized SQL
  throughout (`SqlParameter`, no interpolation), access gated Member+/WorkspaceAdmin with 403-never-404,
  event payloads carry ids/enums only (comment excluded), tokens-only CSS with `data-ds`. One minor note:
  `TasksTab.tsx` is 216 total lines (~192 excluding imports/types — within the component limit).
- **Deferred (developer-approved, per the slice-7 precedent)** — the **design-fidelity render-and-compare**
  and **Playwright e2e execution** both need the full app stack + a headless-browser render pipeline; the
  render pipeline could not be driven in this environment (the design hooks hang on Windows Git Bash).
  Evidence basis for the deferral: token-conformance PASS + `jest-axe` across every gate state + the
  authored `gates.spec.ts` e2e (CI-runnable). These are recorded as Deferred, not skipped.
