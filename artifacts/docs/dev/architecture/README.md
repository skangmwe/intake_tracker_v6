# Architecture — index

| Artifact | Purpose |
|---|---|
| [`data-model.md`](data-model.md) | Entities, relationships, PII/audit constraints, escalation-bridge DB view, index plan. |
| [`api-contracts.md`](api-contracts.md) | Endpoints, DTOs, error contract (RFC 7807), pagination, firm error codes, R2 deferrals. |
| [`module-boundaries.md`](module-boundaries.md) | 22 modules — what each owns, exposes, deliberately doesn't know. Layer rules (web → api → db). |
| [`shared-types.md`](shared-types.md) | Index of the TypeScript vocabulary at `/shared/types/`. |
| [`dependency-graph.md`](dependency-graph.md) | Module dependency graph. Topological ordering. Acyclicity check. |
| [`shared-inventory.md`](shared-inventory.md) | Every cross-cutting utility, UI primitive, and infra helper. Location, consumers, scaffold status. |
| [`slice-plan.md`](slice-plan.md) | The 24-slice Release 1 build plan. LoC ceiling, drift cap, screen coverage. |
| [`scaffold-notes.md`](scaffold-notes.md) | Decisions and gaps recorded during scaffold. Reviewer checklist. |

## Source-of-truth ordering

1. **The prototype** — `artifacts/docs/design/project/AI Solutions Tracker.dc.html` — wins for prototyped screens (per `.claude/rules/design/README.md`).
2. **The build spec** — `artifacts/docs/dev/ai_solutions_tracker_build_spec_final.md` — the canonical spec for objects, fields, workflow, escalation, permissions, reporting, phasing.
3. **The requirements** — `artifacts/docs/product/solution-requirements.md` — intent (why, who, sensitivity, tier, constraints, approvals, timeline).
4. **The blueprint** — `artifacts/docs/design/full-design-blueprint.md` — reconciled screen map, save-for-/build screen specs, role/access matrix.
5. **These architecture artifacts** — the "how" for what the slices build.

## Slice log

Implemented slices, in order. Links the `slice-plan.md` row and any slice doc.

| # | Slice | Status | Plan | Slice doc |
|---|---|---|---|---|
| 1 | Foundation | completed | [slice-plan.md §Slice 1](slice-plan.md) | [01-slice-foundation.md](01-slice-foundation.md) |
| 2 | Auth & app shell | completed | [slice-plan.md §Slice 2](slice-plan.md) | [02-slice-auth-app-shell.md](02-slice-auth-app-shell.md) |
