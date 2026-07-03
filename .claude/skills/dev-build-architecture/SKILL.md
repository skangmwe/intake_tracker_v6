---
name: dev-build-architecture
description: Step 1 — produce architecture artifacts under /artifacts/docs/dev/architecture and /shared/types from a requirements doc. No code. Stops at the architecture review gate.
version: '0.1'
---

# /dev-build-architecture — Step 1: Architecture First

Lock the contracts every later step builds against. **No implementation code.**

The requirements doc is **always** `artifacts/docs/product/solution-requirements.md` at the project root — the Analyst's solution-requirements deliverable. It is the authoritative input; do not accept ad-hoc paths or pasted requirements in its place. Before doing anything else, check whether the file exists. If it does not, **STOP** and prompt the Analyst: _"`artifacts/docs/product/solution-requirements.md` was not found. Copy your completed solution-requirements file into `artifacts/docs/product/` and re-run `/dev-build-architecture`."_ Do not proceed without the file. If the file exists but its top-level sections are `[PENDING]`, **STOP** and ask the Analyst to complete those sections before continuing.

## Workspace — shared across the three build skills

This skill, `/dev-build-scaffold`, and `/dev-build-application` all write
into the **same** workspace, branched off `dev` at the start of this
skill. This is a deliberate exception to the CLAUDE.md "derive a
kebab-case name from the user's request" rule for the integration-branch
guard.

Before any Edit/Write/NotebookEdit in this skill, ask for the shared
workspace by its fixed name:

```bash
WT=$(bash .claude/hooks/begin-change.sh --type build initial-build)
```

`begin-change.sh` is idempotent on name, so when `/dev-build-scaffold`
and `/dev-build-application` later run the same command, they continue
in the same workspace and see this skill's artifacts. **Nothing is
committed or shipped** until the analyst runs `/dev-review-and-remediate`

- `/dev-ship` at the very end of `/dev-build-application` — that final
  ship lands the whole build (architecture + scaffold + slices) on `dev`
  as one merge commit.

Issue every Edit/Write in this skill against paths inside `$WT`.

If `begin-change.sh` reports the project is missing `dev` or has
uncommitted edits on `dev`, **STOP** and report in plain English — that
is a setup issue the analyst can't fix mid-flow.

## Flags

- `--verbose` — opt-in plumbing view. When present in `$ARGUMENTS`,
  strip the flag (it is not part of the requirements doc) before
  parsing the rest, then print `[verbose] git <command and args>` on a
  line of its own _before_ each git invocation this skill runs.
  Verbose is additive — keep the normal narration. See
  [rules/dev/git-workflow.md](../../rules/dev/git-workflow.md) §
  `--verbose` for the full contract.

## Session-start protocol

At the start of every session, batch-read every file you expect to need in a single message with parallel Read tool calls. Tool results land in conversation history and become part of the cached prefix from the second turn onward.

Read in this order:

1. `@/CLAUDE.md`, `@/api/CLAUDE.md`, `@/web/CLAUDE.md`, `@/database/CLAUDE.md`
2. `@/.claude/profile.json`, `@/.claude/rules/slicing.md`
3. `@/artifacts/docs/product/solution-requirements.md` — the requirements doc. Required.
4. `@/artifacts/docs/design/` — the Claude Design handoff. A bundle is present when the folder holds anything **beyond** the known non-bundle artifacts — the CLI-shipped baseline (`mws-design-system-showcase.html`, plus any `.gitkeep`) and the `/design-foundation` outputs (`full-design-blueprint.md`, `HANDOFF-design-brief.md`). If present, read `@/.claude/rules/design/README.md` (the handoff contract) then the project folder — it informs the web-facing module boundaries and UI surface. **Also read `full-design-blueprint.md` in full** — its screen map and deferred-screen specs cover the screens the prototype does *not* include, which this step must turn into slices (§4). The repo design system (`@/.claude/rules/design/_core-requirements.md` + companions) stays the source of truth for tokens and styling; the prototype is a rendering, not the spec.

If steps 1–3 are skipped, restart the session.

After the first read, treat these files as already in context — do NOT re-read mid-session unless a `git diff` or hook message shows the file changed. Mid-session re-reads cost 10× the original cache-hit price.

If you find yourself reaching to re-Read any of the above, stop and reuse what's already in context.

## Steps

### 1. Confirm inputs

- If `artifacts/docs/product/solution-requirements.md` does not exist, **STOP** and ask the Analyst to produce it. Do not fall back to `$ARGUMENTS` for the requirements content.
- If any top-level section of `solution-requirements.md` is `[PENDING]` or empty, **STOP** and surface the gap. Do not guess.
- Read it in full before writing any artifact. Every later artifact must trace back to a section of this file.
- If `/artifacts/docs/dev/architecture/` already has files: list them, ask whether to extend, replace, or abort. Never silently overwrite.
- Detect a **Claude Design handoff** — don't eyeball it. Run the deterministic detector: `bash .claude/hooks/detect-design-handoff.sh`. If it prints **`DESIGN-HANDOFF: ABSENT`**, no bundle has been supplied — tell the developer plainly: _"No Claude Design bundle found in `artifacts/docs/design/`. If you have one, paste it there now and re-run. Continue without a design reference? (yes/no)"_ — and proceed only on an explicit yes. If it prints **`DESIGN-HANDOFF: PRESENT`**, fold the prototype's screens and UI surface into the module boundaries and contracts (visual styling stays governed by the repo design system). **The prototype is only the demo half:** `full-design-blueprint.md` describes the *deferred* screens too (admin, settings, billing, notifications, reporting, etc.). Account for **every** in-scope deferred screen — turn each into a slice in the slice plan (§4), with its data, endpoints, and ownership defined in artifacts 1–3, derived from the blueprint's plain-language specs (purpose, content, business rules, role/access, connects-to) — or list it as out-of-scope with a one-line reason. Never silently drop a deferred screen.

### 2. Produce the seven artifacts

Markdown under `/artifacts/docs/dev/architecture/`, types under `/shared/types/`. Nothing else gets written this step.

| #   | Artifact                                              | File                                           |
| --- | ----------------------------------------------------- | ---------------------------------------------- |
| 1   | Data model — entities, relationships, constraints     | `data-model.md`                                |
| 2   | API contracts — endpoints, request/response, errors   | `api-contracts.md`                             |
| 3   | Module boundaries — what each module owns and exposes | `module-boundaries.md`                         |
| 4   | Shared types — vocabulary all layers speak            | `/shared/types/*.ts` + `shared-types.md` index |
| 5   | Dependency graph — module → module, must be acyclic   | `dependency-graph.md`                          |
| 6   | Shared components inventory (see below)               | `shared-inventory.md`                          |
| 7   | Slice plan (see below)                                | `slice-plan.md`                                |

### 3. Shared inventory (artifact 6)

List every cross-cutting utility (errors, validation, logging, formatters), shared UI primitive (forms, modals, tables, layouts), and infra helper (HTTP client, retry, auth guards, middleware). Per entry:

```
### <name>
- Interface: <signature or short prose>
- Location: /shared/<subdir>/<name>
- Consumers: <slices that will use it>
```

### 4. Slice plan (artifact 7)

Read `slicing.md` first. The plan must declare:

- **Target slice count** — typically 1-3× the spec's user-capability count. Justify if outside.
- **Reviewable LoC ceiling** — typically 5,000-8,000. Lower for security/regulated, higher for greenfield CRUD.
- **Per-slice entry**:

  ```
  ### Slice <n>: <name>
  - Spec section: <…>
  - User capability: "user can do X"
  - Scope: endpoints <…>, UI <…>, audit events <…>
  - Estimated LoC: <≤ ceiling>
  ```

- **Design-handoff coverage** (when a Claude Design handoff is present): every in-scope screen must be reachable from a slice — prototyped screens (from the prototype) and **deferred** screens (from `full-design-blueprint.md`) alike. Tag each slice's screens `[prototyped]` or `[deferred]`; a deferred slice has no prototype and builds from the blueprint's per-screen spec. List any deferred screen you are *not* building, with a one-line reason.
- **Drift cap** — written verbatim: "slice count cannot grow by more than 25% during Step 3 without an architecture-doc update and a re-review."

This plan is the locked contract for Step 3 review cadence.

### 5. Cross-check before stopping

- Every spec requirement maps to at least one slice or decision.
- Dependency graph has no cycles (walk it).
- Every spec requirement maps to ≥1 slice or decision.
- Slice count, ceiling, and drift cap are all on the page.
- When a Claude Design handoff is present, every in-scope deferred screen in `full-design-blueprint.md` maps to ≥1 slice (or appears in the out-of-scope list with a reason).

Fix any failure — do not paper over.

### 6. Report and stop

Report: files written (with paths), slice count + ceiling, and any assumptions you made (call them out explicitly). Then **STOP** for architecture review by a human. Do not start scaffolding.

**Next step:** Once the architecture review is signed off, run `/dev-build-scaffold` — it stands up the per-layer directory structure and `/shared/` modules from the architecture doc, then proves it works with a health-check boot. Do **not** suggest `/dev-build-scaffold` until the human has approved the architecture.

## Do not

- Write implementation code (controllers, components, migrations).
- Modify locked signatures from a prior run without updating the doc and flagging the change.
- Invent contracts that don't trace to the requirements doc.
- Skip the slice plan or shared inventory — both are required.
- Pick a side when the requirements doc contradicts itself — surface the conflict and ask.
- Produce contracts for subsystems excluded by `.claude/profile.json`.
- Plan only the prototyped screens when a `full-design-blueprint.md` is present — every deferred screen must map to a slice or be explicitly listed as out-of-scope.
