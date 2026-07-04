---
slice: 04-lifecycle-gates-admin
capability: a workspace admin defines per-request-type lifecycles — stages (name + status category), approval gates (from→to, team-only approver slots), and the approver-team roster
spec-section: BS §7 / §7.1 / §7.2; api-contracts.md §18; blueprint S31 (prototyped)
started: 2026-07-03T22:16:02-04:00
ended: 2026-07-03T23:09:47-04:00
duration: 00:53:45
---

# Slice 4 — Lifecycle & gates admin (S31, prototyped)

The workspace's lifecycle machinery: `Lifecycle` / `StageDefinition` / `GateDefinition` /
`GateApproverSlot` / `ApproverTeamMembership` / `RoleLabelCatalog`, the full-config reconcile proc,
the `/lifecycle` + `/approver-teams` endpoints, and the S31 editor surface. `npx tsc --noEmit`
clean. Tests authored (DB tSQLt, API xUnit, web jest/jest-axe + Playwright) — executed at
slice-completion by `/dev-review-and-remediate`.

## The divergence that reshaped the slice (decide-and-record)

The slice plan / data-model assumed a **flat single workspace stage-set**. The **prototype's S31 is
authoritative** and renders **many per-request-type Lifecycles**, each owning its own ordered stages
(with a status category) and gates. Per the design handoff (`.claude/rules/design/README.md`, "the
prototype wins for prototyped screens") this was resolved **toward the prototype** — a first-class
`Lifecycle` entity was introduced and the locked contracts updated **before** any code:

- `data-model.md` — new *Lifecycle / StageDefinition / GateDefinition / GateApproverSlot* section;
  stages/gates are lifecycle-scoped; stages carry `StatusCategory`.
- `api-contracts.md` §18 — `GET/PATCH /lifecycle` returns/accepts the whole config; role-labels read
  folded into GET (catalog CRUD stays S37/slice 19).
- `shared/types/gates.ts` + `common.ts` — `LifecycleConfigDto` graph + `LifecycleId`.
- Slice 3's cross-slice note — Stage options now come from the **record's lifecycle's** stages.

This was surfaced to the analyst before building (Step-3 scope divergence), not resolved silently,
because it changes a contract a completed slice (3) had assumed and ripples into slice 5's intake.

## Decisions worth keeping (read before slice 5 / 8)

1. **Stages are lifecycle-scoped; gates reference stages by a stable `StageKey`.** A stage's key is
   fixed across label renames, so a gate keeps pointing at the right stage when it is renamed. Slice
   5's intake picks a lifecycle by **request type**; the Stage field options are that lifecycle's
   stages (the six canonical keys live on the seeded default lifecycle "Standard AI build").

2. **`usp_SaveLifecycleConfig` reconciles the whole structure in one transaction** (OPENJSON):
   present rows upserted, absent rows soft-retired. Because everything is soft-delete (no physical
   DELETE), FK integrity holds throughout. Guards THROW on ≠1 default and on a gate referencing a
   stage outside its lifecycle; the API pre-validates the same in `LifecycleService.ValidateConfig`
   so a bad payload is a clean 400 (proc THROW is the backstop → 500 only on a real bug).

3. **Approver-team members are real `User`s, resolved from a typed name/email** (`usp_Add…` matches
   active workspace members; no-match / ambiguous THROW → 400). The **roster seeds empty** — the
   prototype's named people (Priya Raman, etc.) are mock fixtures, and seeding invented party names
   would break the firm no-invented-facts rule. "N eligible" reads live from an empty roster until
   admins add members. **Slice 8** freezes eligible `UserId`s at gate-open from this table.

4. **Web autosave adopts server ids.** The S31 structure autosaves (debounced) via `PATCH /lifecycle`;
   the mutation returns the refreshed config and the draft re-seeds from it (minted stage/gate ids
   flow back in). The PATCH does **not** invalidate the config query (the draft owns edits); only
   approver-team add/remove invalidate it, because they change the live eligible counts the gates
   show. The gate slot's eligible count is computed from the roster, never stored.

5. **`RoleLabelCatalog` is platform-scope and seeded here** (AI Solutions Manager · GCO · InfoSec ·
   PG/Dept Lead · Data Privacy). S31 only reads it; full CRUD is **S37 / slice 19**.

## Layers touched

Database (7 migrations 022–028 + rollbacks · 9 procs in `lifecycle/` · 3 tSQLt suites) · Shared types
(`gates.ts` lifecycle DTOs + `common.ts` `LifecycleId`) · API (`Modules/Lifecycle` controller/service/
DTOs; 7 keyless projections + DI) · API tests (xUnit: controller + service pure helpers) · Web
(`features/lifecycle`: draft model/reducer, api, hooks, `LifecyclePage` + `LifecyclesBar` / `StagesEditor`
/ `GatesEditor` / `ApproverTeamsEditor` / `AutosaveStatus`, `lifecycle.css`; route `/admin/lifecycle`) ·
Web tests (jest + jest-axe across each new component/hook/util; Playwright `lifecycle.spec.ts`).

Note: DB tSQLt, `dotnet test`, `npm run lint`, `npm run test:coverage`, and Playwright execute at
slice-completion via `/dev-review-and-remediate`.
