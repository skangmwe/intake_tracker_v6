---
slice: 03-fields-schema-engine
capability: a workspace admin defines and edits the field schema for Requests and Tasks — including per-stage visibility, derived fields, and the task-level typed-field library
spec-section: BS §2.3, §3, §17, §17.10, §4.3; api-contracts.md §18/§19; blueprint S30/S34
started: 2026-07-03T20:31:22-04:00
ended: 2026-07-03T21:33:51-04:00
duration: 01:02:29
---

# Slice 3 — Fields & objects schema engine

The metadata engine behind every record: `FieldDefinition` / `SelectOption` / `FieldRule` /
`DerivedField` / `FieldRuleDependency`, the seeded §17 Request schema, the condition engine, and the
S30/S34 admin surfaces. Both screens are `[deferred]` (no prototype) — built from the blueprint and
styled to match the slice-2 shell. `npx tsc --noEmit` clean; API 35 xUnit + web 179 jest/jest-axe green.

## Decisions worth keeping

1. **Platform fields are NOT duplicated as `FieldDefinition` rows per workspace.** The S30 read-only
   band and the S34 surface both read `dbo.PlatformField` directly (one central definition per firm),
   returned as the separate `platformFields[]` array on `WorkspaceFieldSchemaDto`. This avoids the
   `FieldType` vocabulary clash (`PlatformField` uses `Text/Lookup/...`; `FieldDefinition` uses the
   §2.3 catalog) and keeps §4.3 "central definition, local presentation" honest. The local-ordering
   nuance of §4.3 is deferred; Phase-1 renders the band in a fixed order.

2. **`@fieldKey` reference convention in produce-value / default.** A Derived-category rule's
   `ProduceValue` (and a `DerivedField.DefaultValue`) may be a literal or `@fieldKey` — `@outcome`
   means "the value of the Outcome field". The `ConditionEngine` resolves it at read time (slice 5+);
   the seed uses it for Display Status / Mirror Status (§3.4).

3. **Graph validation is C#-side; the DB persists the edges.** `ConditionEngine.ValidateGraph`
   (acyclic + depth ≤ 3, §3.1) runs in `FieldSchemaService` before `usp_UpsertFieldDefinition`.
   `FieldRuleDependency` stores the edges for inspection/re-check; the service recomputes a field's
   outgoing edges from its rules + calculation operands + `@ref`s on each save.

4. **Retire guard is in-workspace only this slice.** `usp_RetireFieldDefinition` blocks retiring a
   platform-defined field and a field another live field still references. The full crossing-map
   retirement guard (a live PG↔AI mapping) lands with the `CrossingMap` table in **slice 19**.

5. **Select options are seeded only where the spec names the values** — Dept/PG/Client (§17.3), the
   AI-side Outcome (§8/§17.9), the PG starter local Outcome (§1.1). Every other select ships
   option-less; admins configure them in S30 (avoids inventing source-specific facts).

## Cross-slice contracts (read before slice 4 / 5)

- **Stage keys.** Per-stage visibility (§17.10) and the derived rules use the six canonical stage
  keys: `intake`, `discovery`, `build`, `qa`, `deploy`, `post-launch`. **Slice 4 must seed
  `StageDefinition` with these exact keys.** The Stage field's *options* are sourced from
  `StageDefinition` (slice 4), not `SelectOption` — the Stage field ships option-less here.
- **Task field library** = Task-object `FieldDefinition`s. The dedicated `/task-fields` endpoint
  returns them with the narrowed library type names (Url/Text/Number/Date/Select/Checkbox) for the
  slice-7 Tasks composer; S30 manages them via the general `/fields?objectType=Task` path.
- `ConditionEngine.Evaluate` and the runtime form-renderer are consumed by **slice 5** (Intake form);
  this slice ships the evaluator + save-time validation, not the render path.

## Layers touched

Database (5 tables 014–018 + rollbacks · 3 seed migrations 019–021 + rollbacks · 6 procs in
`fields/` + `platform/` · 3 tSQLt suites) · Shared types (`fields.ts` + barrel) · API (`ConditionEngine`
+ `AccessGuard` real impls; `Modules/Fields` controller/service/DTOs; `Modules/PlatformAdmin`
controller/service/DTOs; 5 keyless projections; DI) · API tests (xUnit: ConditionEngine, Fields +
PlatformFields controllers, endpoints integration) · Web (`Button` primitive; `withQuery` util; fields
feature api/hooks; S30 page + editor sheet + list + options/rules editors + tabs + platform band; S34
page + row editor; routes `/admin/fields` + `/platform/fields`; `fields.css`) · Web tests (jest +
jest-axe across every new component/hook/util; Playwright `fields.spec.ts`).

Note: DB tSQLt, `dotnet test`, `npm run lint`, and the integration/E2E DB-backed cases execute at
slice-completion via `/dev-review-and-remediate` against LocalDB.
