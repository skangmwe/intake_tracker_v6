---
name: dev-build-scaffold
description: Step 2 — scaffold project skeleton from /artifacts/docs/dev/architecture (config, dirs, DB, auth, /shared/, health-check). No feature logic. Stops at the scaffold review gate.
version: '0.1'
---

# /dev-build-scaffold — Step 2: Scaffold

Stand up the empty skeleton the slice plan will fill. **No feature logic.** The only behaviour shipped is a health-check that proves the stack wires end-to-end.

## Workspace — shared across the three build skills

This skill continues in the **same** workspace that
`/dev-build-architecture` already created, branched off `dev` at the
start of the build flow. This is a deliberate exception to the
CLAUDE.md "derive a kebab-case name from the user's request" rule for
the integration-branch guard.

Before any Edit/Write/NotebookEdit in this skill, ask for the shared
workspace by its fixed name (idempotent — returns the same one
`/dev-build-architecture` used):

```bash
WT=$(bash .claude/hooks/begin-change.sh --type build initial-build)
```

The architecture artifacts written by `/dev-build-architecture` live
inside `$WT` (not on `dev`). Read them from there, write the scaffold
on top of them, also inside `$WT`. **Nothing is committed or shipped**
until the analyst runs `/dev-review-and-remediate` + `/dev-ship` at the
very end of `/dev-build-application`.

If `$WT` doesn't already contain the seven architecture artifacts under
`artifacts/docs/dev/architecture/`, **STOP** and tell the analyst to
run `/dev-build-architecture` first.

Issue every Edit/Write in this skill against paths inside `$WT`.

## Flags

- `--verbose` — opt-in plumbing view. When present in `$ARGUMENTS`,
  strip the flag and then print `[verbose] git <command and args>` on a
  line of its own *before* each git invocation this skill runs. Verbose
  is additive — keep the normal narration. See
  [rules/dev/git-workflow.md](../../rules/dev/git-workflow.md) §
  `--verbose` for the full contract.

## Session-start protocol

At the start of every session, batch-read every file you expect to need in a single message with parallel Read tool calls. Tool results land in conversation history and become part of the cached prefix from the second turn onward.

Read in this order:

1. `@/CLAUDE.md`, `@/api/CLAUDE.md`, `@/web/CLAUDE.md`, `@/database/CLAUDE.md`
2. `@/.claude/profile.json`
3. `/docs/architecture/` (all files)
4. `/shared/` (full tree — know what exists before writing anything)
5. `slice-plan.md` — identify the starting slice
6. `artifacts/docs/design/` — the Claude Design handoff, if present (anything beyond the CLI-shipped `mws-design-system-showcase.html`, plus any `.gitkeep`). Read the handoff contract at `.claude/rules/design/README.md` then the project folder so the `web/` skeleton's directory structure and placeholder files reflect the screens it shows. Tokens and styling come from the repo design system, not the HTML; feature logic is still out of scope for the scaffold.

If steps 1–5 are skipped, restart the session.

After the first read, treat these files as already in context — do NOT re-read mid-session unless a `git diff` or hook message shows the file changed. Mid-session re-reads cost 10× the original cache-hit price.

If you find yourself reaching to re-Read any of the above, stop and reuse what's already in context.

## Steps

### 1. Guard

- The architecture artifacts live in the **shared workspace `$WT`** (from the Workspace section above), not on `dev`. If `$WT/artifacts/docs/dev/architecture/` is missing or empty, **STOP** — tell the analyst to run `/dev-build-architecture` first.
- Verify all seven Step 1 artifacts exist inside `$WT/artifacts/docs/dev/architecture/`: `data-model.md`, `api-contracts.md`, `module-boundaries.md`, `shared-types.md` (plus its `$WT/shared/types/*.ts`), `dependency-graph.md`, `shared-inventory.md`, `slice-plan.md`. Any missing → **STOP**.

### 2. Load contracts

Read every file under `/artifacts/docs/dev/architecture/` and `/shared/types/`. State which slices from `slice-plan.md` the scaffold must support first (typically the first 3-5).

### 3. Scaffold the skeleton

For each module in `module-boundaries.md`, create the directory and entry-point file with no feature logic:

- **Configuration** — env loader, schema, secrets wiring. Validate at boot.
- **Directory structure** — folder tree matching `module-boundaries.md`. Every leaf gets a placeholder file with a one-line "what belongs here" comment.
- **Database connection** — pool/client wiring only. No queries. No migrations beyond what health-check needs.
- **Auth middleware** — stub the pipeline; do not implement policy.
- **Shared types** — re-export `/shared/types/` so every layer imports one canonical shape.
- **Health-check endpoint** — single endpoint hitting config + DB + auth pipeline. Green response = stack is wired.

### 4. Scaffold /shared/

For every entry in `shared-inventory.md`:

- Create `/shared/<concern>/`.
- Add `index.ts` (or equivalent) that **exports only** — no implementation.
- Add `README.md` with two sections:

  ```
  ## What belongs here
  <one-paragraph charter, traced to shared-inventory.md>

  ## What does not belong here
  <explicit out-of-scope list>
  ```

Goal: a slice author scans `/shared/` once and knows where to import from vs. where to extend.

### 5. Update the architecture doc

- `module-boundaries.md` — note any directory names that diverged, and why.
- `shared-inventory.md` — add "Status: scaffolded" + on-disk location per entry.
- New `scaffold-notes.md` — decisions, gaps, contract clarifications surfaced during scaffolding. Add a row for it in `/artifacts/docs/dev/architecture/README.md` so it's reachable from the index.

### 6. Prove it works

Boot the app, hit `/health`. Green response is the exit criterion — capture status + body in the report. If it fails, fix it before stopping. A scaffold that doesn't boot is not a scaffold.

### 7. Report and stop

Report: directories created (root + `/shared/`), health-check status, architecture-doc changes made, and explicit confirmation to the reviewer that **(a)** the structure supports the slice plan and **(b)** `/shared/` is sufficient for the first 3-5 slices to consume rather than reimplement. Then **STOP** for scaffold review.

**Next step:** Once the scaffold review is signed off, run `/dev-build-application` — it works through `slice-plan.md` one slice at a time, pausing between slices for analyst confirmation. Do **not** suggest `/dev-build-application` until the human has approved the scaffold.

## If scaffolding surfaces an architecture problem

Scaffold review does **not** re-litigate architecture. But if a real defect appears (boundary that can't stand, shared concern with no home, file-level dependency cycle): stop, surface it, update `/artifacts/docs/dev/architecture/`, re-run the Step 1 review, then resume.

Do not paper over architecture defects with scaffold workarounds.

## Do not

- Implement feature logic, business validation, domain rules, or any controller beyond health-check.
- Invent shared concerns absent from `shared-inventory.md`.
- Modify locked signatures from `/artifacts/docs/dev/architecture/` without updating the doc and flagging the change.
- Skip the health-check — it is the contract that proves the wiring.
