---
slice: 05-requests-core
capability: A user creates a Request via the intake form, sees it on the Requests list, opens the record detail, edits the Intake tab, and moves it through stages.
spec-section: BS §9, §17, §22, §23; requirements §5 (stories 1–4)
started: 2026-07-04T09:02:21-04:00
ended: 2026-07-04T10:11:30-04:00
duration: 01:09:09
---

# Slice 5 — Requests core

The largest slice (6,000-LoC ceiling). Ships S3 Intake form, S2 Requests list, S4 Record detail
(editable Intake tab; other tabs stubbed to their owning slices), and the S26 Drafts surface.

## Storage model decision (Requests table)

Content-field values live in a single `FieldValues` **JSON** column — the field schema is
workspace-configurable (S30), so a fixed column per field would fight the data-driven design.
`Name`, `Description`, `Stage` are also **authoritative real columns** (set explicitly; hot on the
list + covering index); the service mirrors them into the JSON map so the condition engine derives
`Display/Mirror Status`. A few list-critical values are **persisted computed columns** projected
from the JSON (`DeptPgClient`, `AssignedAnalyst`, `DueDate`, `PriorityScore`) so `usp_QueryRequests`
filters/sorts/covers without per-row JSON parsing. Hold lives in the JSON (`holdBlocked`/`holdReason`)
so the derivation engine sees it. ETag/optimistic-concurrency via a `ROWVERSION` (`RowVer`) column,
surfaced base64. **PK is composite `(WorkspaceId, RecordId)`** — escalation (slice 9) adds a second
row with the same `RecordId` on the AI Solutions workspace, so `RecordId` alone is not unique.

## Prototype divergences resolved (prototype wins — handoff precedence)

1. **Intake form is data-driven.** The prototype's hard-coded dropdown options (Litigation / M&A /
   Tax…) and named people (Priya Raman, D. Whitfield…) are **mock fixtures** — same precedent as
   slice 4's approver-team members. The real intake form renders from the workspace field schema
   (`GET /workspaces/{id}/fields`), grouped by section, using the prototype's exact visual form
   (four numbered section cards, two-column pairing, the Priority-Score slider widget for
   businessValue/efficiencyGain/levelOfEffort, sticky Similar-requests panel stub, Save-draft +
   Submit). Real select options come from the schema's `SelectOption`s (admins configure them in
   S30). The create form surfaces the four sections **Intake · Value mapping · Solution details ·
   Triage** (`INTAKE_CREATE_SECTIONS`); the Client-number/Matter fields reveal only when
   Dept/PG/Client = Client (the schema's Require rule also enforces it on submit).

2. **Record detail has 6 tabs and no right rail.** The blueprint text said "three tabs + a side
   panel"; the **live prototype** renders six tabs — **Status · Intake · Attachments · Tasks & gates
   · Activity · Watchers & alerts** — with Relationships / Attachments / Watchers as *tabs*, not
   side-panel cards, and the meta strip carrying **4** fields (Submitted moved into the Intake tab).
   Built to the prototype. This slice owns the editable **Intake** tab, the sticky lifecycle stepper,
   and the Status-tab hold + stage-move controls; the other four tabs are accessible stubs handed to
   their owning slices (Attachments→11, Tasks & gates→7/8, Activity→6, Watchers→12, Relationships→10).

## Contract additions (living docs updated)

- `shared/types/drafts.ts` — `DraftDto` / `DraftListRow` / `DraftSaveRequest` / `DraftBody` (new).
- `RequestDto` gained `lifecycleId: LifecycleId` and `stages: RequestStageRef[]` (the record's
  lifecycle's ordered stages) so the detail stepper renders without a second lifecycle fetch. The
  API populates both from the same stage read it uses to derive `displayStatus`'s label.

## Out of scope (per slice-plan, deferred to later slices)

Escalate (9), close/Copy/typed-links (10), tasks (7), gates/approvals (8), comments/activity (6),
attachments (11), watchers (12), similar-requests matching (6), real saved-view editor (14),
real SLA/aging derivation (21 — this slice ships a simple due-date compute + tint hooks).

## Notable implementation choices

- `POST /requests/{id}/stage` applies the transition with **no gate integration** (slice 8 wires gates).
- Access on record-scoped reads is **baked into the query** (`usp_GetRequestByIdForUser` joins
  membership): a forbidden or non-existent record both return zero rows → the API returns **403**,
  never disclosing existence (BS §22.6).
- PATCH with a missing `If-Match` → 400 (client input error); a mismatched ETag → 409 `stale-record`.
- Drafts are the sole hard-deletable entity (owner-scoped); everything else is soft-delete.

## Real-stack validation (design-fidelity gate)

The slice-completion gate stood up the full stack against real SQL (LocalDB deploy of all 31
migrations + 32 procs, API + web dev server, seeded data) and rendered the built prototyped screens.
This caught **two real bugs the FakeTable tSQLt tests + RTL tests could not**, both fixed + re-verified:
- **`Requests.DueDate` non-deterministic PERSISTED computed column** — `TRY_CONVERT(DATE, JSON_VALUE(…))`
  can't be persisted; real `CREATE TABLE` failed. Fixed: non-persisted computed column, dropped from the
  covering-index INCLUDE (migration `20260704_029`). Validated by re-deploy + end-to-end proc smoke test.
- **S4 meta-strip due-date off-by-one** — tz-naive `new Date('yyyy-mm-dd')` rendered one day early. Fixed
  by parsing date-only ISO strings as local time (`RecordDetailPage.tsx`).
S2/S3/S4 + SHELL render faithfully to the prototype. The gate stays UNRESOLVED (structural): S1/S5/S6 are
future-slice prototyped screens (not built) → no whole-app CLEAN manifest possible mid-build.

## Test coverage note (web)

Web branch coverage is **78.6%** — within the `web-testing.md` **[78%, 80%) acceptance band**. All 411 web tests pass; every required behaviour case (loading/error/empty, a11y via jest-axe, the primary create→list→detail→edit flows, per-field-type rendering, condition-rule evaluation) is covered. The uncovered branches are edge handlers on the large list/detail page components (rare error permutations, some resize/sort keyboard branches on the shared `TableShell`) — documented here per the rule's one-line-justification clause. Statements 87.98% / funcs 83.53% / lines 89.17% are all ≥80%. Not lowered in `jest.config.ts`.

## Known follow-up (not a slice-5 blocker)

- **Full-width list surface.** `app-shell-and-headers.md` says data-dense surfaces (tables) go
  full-width, and the prototype's Requests list is full-bleed. The current `AppShell` caps every
  routed surface at `min(100%, 1200px)` via `.app-shell__main-inner` (slice 2). The list renders
  correctly but capped. Giving data-dense routes a full-width, un-padded region is a small AppShell
  enhancement best done with slice-2 context (a route/width variant) — deferred rather than reworking
  the shell mid-slice. Flag for the design-fidelity review.
