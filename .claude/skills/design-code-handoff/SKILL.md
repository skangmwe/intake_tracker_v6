---
name: design-code-handoff
description: >-
  Reconciles `full-design-blueprint.md` against the Claude Design prototype and
  `solution-requirements.md`. Takes a **manually placed project archive** as
  input — the user exports the prototype from Claude Design and drops the archive (a `.zip` or
  extracted folder) at `artifacts/docs/design/` before running the skill. The build reads the
  prototype directly: prototyped screens are built exactly from it, and the Save-for-/build
  screens are built from the blueprint and styled to match the prototype as closely as possible
  — there is no separate visual-contract artifact. Adds two columns to the blueprint's screen
  map — **Prototype source** (the prototype file each in-scope screen renders against, blank when
  the screen has no prototype presence) and **App route / component** (filled in by the build
  pipeline) — so any downstream visual review against the prototype can look up each screen's
  reference directly in the blueprint. Applies every update silently — there is no reconciliation
  checkpoint; the user sees what changed in a closing summary. Use once the prototype is approved
  and the user is ready to start the build.
---

# design-code-handoff

By the time the prototype is approved, the blueprint is stale (prototypes evolve during iteration) and the requirements may have drifted from the design (features dropped, scope crept in). This skill reconciles both in one pass: it reads the prototype and the requirements directly, detects all drift, and **applies every update silently — there is no user checkpoint**. It updates the blueprint in place (and the requirements doc when scope changes follow from reconciliation), then reports what it changed in a closing summary.

## Glossary

- **Blueprint** (`artifacts/docs/design/full-design-blueprint.md`) — reconciled plan: screen map, save-for-/build screen specs, role/access matrix.
- **Requirements** (`artifacts/docs/product/solution-requirements.md`) — original spec of intent; what each feature is supposed to do.
- **Save-for-/build** — a screen in the blueprint that wasn't prototyped; built later from the blueprint's spec, styled to match the prototyped screens.
- **Provenance** — where a blueprint change came from: a changelog line (`[from changelog: "<line>"]`) or reconciliation inference.
- **Changelog** (`artifacts/docs/design/project/changelog.md`) — user-confirmed iterations from the prototyping session; cross-cutting evidence.
- **Footprint type** — how a screen appears in the prototype: **full rendered screen**, **out-of-scope stub**, or **nav entry only**. Only these three count as evidence a screen exists.

## Inputs

This skill operates on two paired paths inside the active directory: **`artifacts/docs/design/`** (where design-foundation wrote its outputs) and **`artifacts/docs/product/`** (where the requirements live). All three inputs are local files; the user places the prototype archive at the design folder before running:

1. **`artifacts/docs/design/full-design-blueprint.md`** — produced by design-foundation. The skill updates this file in place during reconciliation.
2. **`artifacts/docs/product/solution-requirements.md`** — written by the requirements-gathering skill. The skill **actively compares this against the blueprint**, and may update it in place when reconciliation finds scope additions or rewordings — applied silently, with no checkpoint.
3. **Manually placed prototype archive at `artifacts/docs/design/`** — the user exports the project from Claude Design and drops the result (a `.zip` file or an already-extracted folder) at `artifacts/docs/design/` before running the skill. The skill normalizes whatever the user placed into the canonical local path `artifacts/docs/design/project/` and reads from there.

## Procedure

The skill runs in three steps. **Run silently from the opening prompt through to the closing summary** — no narration, no per-step recaps, no inventories, and **no reconciliation checkpoint**. Reconciliation findings are resolved automatically (see the resolution defaults in step 2) and applied in place; the user does not confirm them. The only user-facing messages allowed are: the opening prompt itself, inventory questions when content is genuinely ambiguous (multiple focal candidates, possible duplicates, a file that may not be a real screen — these identify the archive, they don't confirm changes), the error-recovery message if the archive can't be read, and the closing summary of what was changed.

### 1. Confirm the archive is in place and inventory it

**Open the run with one direct question:**

> *"Have you dropped the exported project archive at `artifacts/docs/design/`? Reply 'ready' once it's in place — a `.zip` file or an extracted folder is both fine. If you haven't exported yet, export the project from Claude Design first, place it in that folder, then say 'ready'."*

Once the user confirms, run the file identification protocol in `file-identification-protocol.md` to find the archive at `artifacts/docs/design/`, normalize it to `artifacts/docs/design/project/`, rename `README.md` to `prototype-readme.md`, and run the focal-screen inventory. **The normalized local folder is what the build pipeline reads** — re-running the build doesn't depend on any external state.

If the user says the archive is ready but the protocol can't find one at `artifacts/docs/design/`, ask the user inline where they placed it and walk through the path before proceeding.

### 2. Scan, reconcile, and apply silently

Read everything: prototype inventory, `artifacts/docs/design/project/changelog.md` if it exists, and `solution-requirements.md`. Walk the prototype and the changelog in one pass and produce findings on structure, content, and scope. This skill does not audit or record visual treatment — the build ports the look directly from the prototype (see `.claude/rules/design/README.md`).

**Structure / content / scope changes → blueprint and requirements updates.** Inventory each prototype screen with footprint type. **Do not treat code comments, commented-out or dead code, or seed/sample data as evidence of intent** — these are frequently leftovers from removed work. Compare the inventory against the blueprint (added / removed / changed screens, navigation, tag changes, content shifts), and compare requirements against the blueprint (missing implementations, scope creep, interpretation drift; model-judged loosely so phrasing differences don't trigger false positives). **Cross-reference every finding against the changelog** — corroborated findings get `[from changelog: "<line>"]` tags recording that they came from deliberate user steering during prototyping.

**Resolve every finding automatically — there is no checkpoint.** Categorize each finding, then apply the silent default for its category. The categorization is the same analysis as before; only the resolution changes — the skill decides and writes, the user is never asked. The defaults are **non-destructive** (nothing is deleted on the skill's own judgment — the only removal is a screen the changelog explicitly records the user asking to delete or remove, surfaced in the closing summary) and **faithful to the prototype** (the approved artifact wins). Sort changelog-sourced findings first within each category for the closing summary.

- **Added** — design has it; original plan didn't (prototype-added screens AND unrequired blueprint additions). → **Codify it**: add to the blueprint, and to `solution-requirements.md` if it wasn't there.
- **Missing** — original plan has it; design doesn't (Prototype-tagged screens that weren't built AND requirements absent from the blueprint). → **Keep it, retagged save-for-/build** — this is the default even for a screen that was scoped for the prototype and named in the requirements but never rendered: a prototype omission is not evidence the screen was cut, so carry it forward as deferred and annotate. **The one exception: if the changelog explicitly cites the user asking to delete or remove that screen, honor it** — remove the screen from the blueprint (and from `solution-requirements.md`) and note the changelog line. Absence from the prototype alone never deletes; only an explicit changelog deletion or removal request does.
- **Changed** — present in both, but different (navigation tweaks, tag changes, content shifts, interpretation drift). → **Keep the design** (the prototype reflects what was approved); reword `solution-requirements.md` if the original wording came from there.
- **Save-for-/build screens** — → **Keep every one as-is**: don't auto-promote, don't delete; carry them forward unchanged. (Without a user to confirm, the non-destructive default is to preserve what the blueprint already tagged.) Same deletion exception as **Missing**: remove one only if the changelog explicitly cites the user asking to delete or remove it.

Apply every resolution in place. The user sees what changed in the closing summary, not before — keep that summary scannable.

**Apply updates in place.** Update `full-design-blueprint.md`: refresh the master table (tags, connects-to, contents) and rewrite the navigation graph to match the prototype. Add two columns to the master table — **Prototype source** (the prototype file or screen identifier each in-scope screen should be visually diffed against; *"prototype source,"* not *"prototype HTML,"* since the format may not be HTML) and **App route / component** (the build pipeline fills it in). Save-for-/build screens with no prototype presence get a blank Prototype source — that signals visual review to skip them. **The Prototype source column is a navigation aid for visual review, not a source of truth — it tells a reviewer where to look, not what to build.** Annotate changelog provenance on every blueprint update — `[from changelog: "<line>"]` inline on edited rows, screen blocks, and navigation-graph edits. Append "Reconciled with prototype on [date], from manually placed archive" to the blueprint.

If reconciliation changed scope, update `solution-requirements.md` in place: add new feature entries, reword interpretation-drift items, or remove a screen **only when the changelog explicitly cites the user asking to delete or remove it**. Absent that, the silent defaults never *remove* items — Missing items are carried forward as save-for-/build rather than dropped. Append "Updated alongside design-code-handoff on [date]".

The design brief (`HANDOFF-design-brief.md`) is **superseded by the prototype** — Claude Code should not build from it. If it's regenerated or re-run in Claude Design (to re-prototype or extend), **re-validate it against the reconciled blueprint first**: strip or "context only — do not build" any reference to a screen/feature that was removed or remains tagged save-for-/build.

### 3. Hand off to `/build`

The standing design-rules README (`.claude/rules/design/README.md`) tells `/build` how to read these artifacts in precedence order. Nothing for this skill to write here — it's an existing instruction.

## At the end of every run — tell the user what's next

Communicate as the final message, no preamble. **All reconciliation was resolved and applied automatically — there was no confirmation step, so this summary is the first place the user sees what changed.** Summarize the material changes: what was codified (Added) and what was carried forward as deferred (Missing → save-for-/build). The blueprint is reconciled against the prototype (normalized at `artifacts/docs/design/project/`) and the requirements; `solution-requirements.md` was updated if scope changed. Blueprint rows from changelog findings carry inline `[from changelog: "<line>"]`. The blueprint's master table carries a **Prototype source** column (blank for save-for-/build screens with no prototype presence — visual review skips those) and an **App route / component** column (the build fills it in).

**Next step:** Run `/dev-build-architecture` — it reads everything in place from `artifacts/docs/design/` and `artifacts/docs/product/`, then produces the architecture artifacts. **The build reads two artifacts plus the prototype:** `full-design-blueprint.md` (scope, structure, content) and `solution-requirements.md` (intent), and it ports the visual look directly from the prototype bundle at `artifacts/docs/design/project/`. The blueprint's **Prototype source** column is a navigation aid for visual review, not a separate source. Stay available to review what gets built.
