---
name: dev-review-and-remediate
description: Automated quality-gate pipeline — runs the unit tests authored by /dev-build-application (extending only when a required case is missing), then runs code-review + security-review, all in a single bounded iteration loop. Auto-remediates mechanical findings (test bugs, source bugs surfaced by tests, code-quality, security), surfaces architectural findings for per-item developer decision, and writes durable artefacts under /reviews/. Replaces the per-slice review gate in /dev-build-application. Zero required inputs; scope and labelling are derived from git state.
version: "2.1"
---

# /dev-review-and-remediate — Bounded test-run + review + remediation loop

Runs the unit tests authored by `/dev-build-application`, then runs `/dev-code-review` + `/dev-security-review` + `/dev-remediation` — all inside one **bounded loop** (max 5 iterations) against a work item. Auto-applies mechanical fixes (test bugs, source bugs surfaced by tests, code-quality, security). Pauses for per-item developer decisions on architectural fixes — one batched prompt per iteration covering all three phases. Records every action as a durable artefact under `/reviews/`. Writes a cache file `reviews/.last-clean-run.json` that `/dev-ship` consults to skip duplicate reviews.

This skill is the **slice-completion gate** for `/dev-build-application` — devs run it after each slice; `/dev-build-application` no longer invokes reviews or runs tests, but it does author them. Phase 0 below extends tests only when a required case is missing per the layer's testing rules; the bulk of test authorship belongs in the slice. The standalone `/dev-unit-test-and-remediate` and `/dev-code-review` / `/dev-security-review` skills remain available for ad-hoc, single-concern runs.

Designed for both **hands-on** and **end-to-end automation** flows. In the common case the invocation is one command with no arguments; the skill figures out scope, filenames, and stopping conditions from git state.

---

## Invocation

### Zero-argument default (the 95% case)

```
/dev-review-and-remediate
```

No inputs. The skill derives:

- **Scope** — files changed since the last successful run's HEAD SHA (via `reviews/.watermark.json`) union any uncommitted files.
- **Label** — auto-generated from branch name, commit subject, or a wip-stamp depending on whether there are uncommitted changes (see Auto-labelling below).

### Optional overrides

| Flag | Effect |
|---|---|
| `--label <string>` | Override the auto-generated label; used only for output filenames. |
| `--scope files:<glob>` | Override scope to an explicit file glob (re-review an earlier area). |
| `--scope since:<date>` | Override scope to files changed since an ISO date (`2026-04-15`, `2026-04-15T09:00:00Z`). |
| `--force` | Overwrite existing per-run output files if the label collides. |
| `--max-iterations <n>` | Override the default 5-iteration cap (rarely needed). |
| `--verbose` | Opt-in plumbing view: print `[verbose] git <command and args>` before each git invocation (`rev-parse`, `diff`, `status`, etc.). Strip the flag from `$ARGUMENTS` before parsing the rest. Verbose is additive — keep the normal narration. See [rules/dev/git-workflow.md](../../rules/dev/git-workflow.md) § `--verbose`. |

Overrides are independent and can be combined.

---

## Pre-flight (every run)

1. **Load context.** Read `artifacts/docs/dev/architecture/README.md` + every numbered doc under `artifacts/docs/dev/architecture/`. Read the full `shared/` tree so you know what types, constants, and contracts already exist.
2. **Load review checklists.** Based on the scoped file set, load only the checklists relevant to the changed layers:
   - Database files (`.sql`, `database/migrations/**`) → `.claude/skills/dev-code-review/database-backend.md` + `.claude/skills/dev-security-review/database-backend-security.md`
   - API files (`.cs`, `Program.cs`, `Dockerfile`, `appsettings*.json`) → `.claude/skills/dev-code-review/api-middletier.md` + `.claude/skills/dev-security-review/api-middletier-security.md`
   - Frontend files (`.ts`, `.tsx`, `.scss`, `.css`) → `.claude/skills/dev-code-review/web-frontend.md` + `.claude/skills/dev-security-review/web-frontend-security.md`. **Also load `.claude/skills/dev-review-and-remediate/design-fidelity-web.md` when `artifacts/docs/design/` holds a Claude Design handoff** — drives the design-fidelity matrix inside Phase 1.
3. **Load unit-test rules + templates** for layers in scope (drives Phase 0):
   - API → `.claude/rules/dev/api-testing-guidelines.md` + `.claude/skills/dev-unit-test-and-remediate/api-unit-tests.md`. If `document-pipeline` is present, also `.claude/rules/dev/document-pipeline/api-pipeline-tests.md`.
   - Database → `.claude/rules/dev/database-testing.md` + `.claude/skills/dev-unit-test-and-remediate/database-unit-tests.md`.
   - Frontend → `.claude/rules/dev/web-testing.md` + `.claude/rules/design/accessibility.md` + `.claude/skills/dev-unit-test-and-remediate/web-unit-tests.md`.
4. **Load remediation logic.** `.claude/skills/dev-remediation/SKILL.md` + the layer-specific `*-remediation-logic.md` files that match the scope. These cover both source bugs surfaced by tests (Phase 0) and review findings (Phases 1 & 2).
5. **Load prior architectural decisions.** Read `reviews/architectural-findings.md` (if present) to build an in-memory map of `<file + rule> → decision` so previously-rejected findings are not re-raised. Match keys for unit-test findings are prefixed `unit-test/` to avoid collision with code-review entries (a file may have legitimate findings from both phases against different rules).

---

## Scope derivation

### Primary — watermark diff

Read `reviews/.watermark.json`:

```json
{
  "last_head_sha": "a3f7e2cb9d4f11...",
  "last_run_timestamp": "2026-04-23T14:30:00Z",
  "last_label": "feat-conversations-crud-a3f7e2c",
  "last_status": "clean"
}
```

- **Scope** = `git diff <last_head_sha>..HEAD --name-only` **union** `git status --porcelain` (uncommitted staged + unstaged files).
- Missing / corrupted watermark → fall back to `git diff --name-only` (staged + unstaged).
- Watermark points to a commit that no longer exists (history rewrite) → warn, ignore watermark, fall back to `git diff --name-only`, advise the developer to commit and re-run.

### Override — `--scope files:<glob>` or `--scope since:<date>`

- `files:` overrides watermark entirely; scope is the literal glob expansion.
- `since:` scope = `git log --since=<date> --name-only --pretty=format:`.

### Filtering

Regardless of scope source, drop files that belong to:

- `.claude/` (tooling)
- `artifacts/docs/dev/architecture/` (architecture docs are updated *by* the skill, not *reviewed* as code)
- `reviews/` (skill outputs)
- `prompts/` (skill definitions and templates)
- Lockfiles (`package-lock.json`, `*.sum`, `Cargo.lock`, etc.)
- Existing test files (`*Tests.cs`, `*.test.ts`, `*.test.tsx`, `test_*.sql`) — Phase 0 *produces* tests; existing tests are not its input. They are still reviewed by Phases 1 & 2 if changed, so keep them in scope for those phases. Implementation note: maintain two scope sets — `source_scope` (filtered as above, drives Phase 0) and `review_scope` (without the test-file filter, drives Phases 1 & 2).

### Empty scope

If scope is empty after filtering, exit with "Nothing to review — no changes since `<last_label>` (SHA `<last_head_sha>`)." Do not create any output files.

---

## Auto-labelling

The label is used only to name this run's output files. The skill detects whether there are uncommitted changes and picks the label source accordingly.

### Step 1 — Detect mode

- If `git status --porcelain` is **non-empty** → **pre-commit mode**. The latest commit describes previous work, not this review. Use a different source.
- If `git status --porcelain` is **empty** → **post-commit mode**. The latest commit describes the work being reviewed. Use its subject.

### Step 2 — Pick the source (first one that yields a meaningful slug wins)

**Pre-commit mode** — try in order:

1. **Branch name** via `git rev-parse --abbrev-ref HEAD`.
   - Skip if it's a generic trunk name: `main`, `master`, `develop`, `trunk`, `HEAD`, detached-head state.
   - Slugify: lower-case; `/` and non-alphanum → `-`; collapse repeated `-`; strip leading/trailing `-`; truncate to 40 chars.
   - Example: `feat/export-pdf` → `feat-export-pdf`.
2. **Dominant file-path prefix** from the scoped file list.
   - Pick the deepest common prefix that isn't a top-level directory (skip bare `api/`, `web/`, `database/`).
   - Slugify the leaf segment.
   - Example: scope = `api/src/Atticus.Api/Features/Export/*.cs` + `web/src/features/Export/*.tsx` → `export`.
3. **wip-stamp** as final fallback.
   - Format: `wip-<YYYYMMDD>-<HHMM>-<git_user_slug>`.
   - Example: `wip-20260423-1430-nagarjuna`.

**Post-commit mode** — one source:

1. **Latest commit subject** via `git log -1 --pretty=format:%s`.
   - Slugify same as branch name.
   - Example: `"feat: conversations CRUD"` → `feat-conversations-crud`.

### Step 3 — Append a short SHA for uniqueness

Always append `-<short_sha>` where `short_sha = git rev-parse --short HEAD`. If no commits yet, omit the SHA.

### Examples

| Situation | Source used | Final label |
|---|---|---|
| On branch `feat/export-pdf`, uncommitted work, HEAD `a3f7e2c` | Branch name | `feat-export-pdf-a3f7e2c` |
| On `main`, uncommitted work, all files under `api/.../Export/` | File-path prefix | `export-a3f7e2c` |
| On `main`, uncommitted work, files scattered across the repo | wip-stamp | `wip-20260423-1430-nagarjuna` |
| Clean working tree, HEAD subject `"feat: conversations CRUD"` | Commit subject | `feat-conversations-crud-a3f7e2c` |

### Collision handling

If `reviews/code-review-findings/<label>.md` already exists:

- Without `--force` → abort with "Label collision: `<label>` already reviewed. Pass `--force` to overwrite, or `--label <new>` to file separately."
- With `--force` → overwrite; the previous iteration log's contents are lost (they are per-run anyway).

---

## Iteration loop

> **CLEAN is one outcome, not the goal.** UNRESOLVED-STUCK and UNRESOLVED-CAP
> are equally complete results of a thorough review. Do not steer toward CLEAN
> by skipping checks, glossing over evidence gaps, or accepting verdicts that
> lack opened-file references. A review that reports no findings on a screen
> it did not open — or on a **component it did not individually diff**, or an
> **interaction state (hover / focus-visible / active) it did not capture** —
> is a failed review, not a clean one. The clean-run cache
> exists to record an honest verdict; producing a CLEAN cache from partial work
> is a process violation, not a shortcut.

Run iterations `1..MAX_ITERATIONS` (default 5). Each iteration is one complete pass of steps 1–6 below. After each iteration, evaluate the **stop conditions**.

Each iteration runs the **design-fidelity UI render-and-compare FIRST** — when frontend is in scope and a design handoff is present, standing the already-built app up locally via the `/local-testing` skill (see Phase 1's design-fidelity step) — then three phases in order: **Phase 0 — unit tests**, **Phase 1 — code review**, **Phase 2 — security review**. **No phase hard-stops the run:** each records its findings and the iteration proceeds through every phase, so a failing/un-runnable test (or any later phase) can never prevent the UI comparison from having run. The UI comparison is **independent of the test infrastructure** — that decoupling is the point. A Critical/High from any phase (UI comparison included) blocks `CLEAN`. Mechanical fixes auto-apply at the end of each phase before the next phase begins (so code review sees the test-fixed source, and security review sees the code-review-fixed source). **In every phase, when a mechanical fix touches source code, the affected unit tests are re-run before the phase completes** — this prevents source-changing Phase 1 or Phase 2 fixes from reaching `CLEAN` without test verification. Architectural findings from all three phases are batched into a **single** developer prompt at the end of the iteration.

### Step 1 — Phase 0: Unit-test execution, gap-fill, and remediation

`/dev-build-application` is the primary author of unit tests for the slice. Phase 0's job is to **run them**, **extend only what is missing**, and **remediate failures** (test bugs and source bugs that the tests surface).

For each file in **`source_scope`** (changed source, test files filtered out):

- Decide per the layer's `*-unit-tests.md` template:
  - **Test exists and is complete** → leave alone (the common case after `/dev-build-application`).
  - **Test exists but missing a required case** (per `api-testing-guidelines.md` always-test list, `database-testing.md` AAA scenarios, `web-testing.md` accessibility + behaviour cases) → extend with the missing case.
  - **No test exists** → create from the template. This should be rare; surface it as a "slice authoring gap" finding alongside the remediation so the developer knows `/dev-build-application` missed it.
- Never delete or replace passing tests.
- Apply any test changes per layer, then run scoped to changed tests:
  - API → `dotnet test` for affected projects.
  - Database → tSQLt on affected schemas.
  - Frontend → `npm test -- --testPathPattern=<files>`. After the loop closes, run `npm run test:coverage` to confirm 80% thresholds.
- Append generated/extended tests to `reviews/unit-tests/tests-added/<label>.md` and failures/gaps to `reviews/unit-tests/test-failures/<label>.md`, both under `## Iteration <N>`.
- Classify each test failure / gap as **Critical**, **High**, **Medium**, or **Low**, with fix class `Mechanical` (test bug, missing required case, or source bug surfaced by a correctly-written test) or `Architectural` (test reveals a design issue: tight coupling, untestable singleton, missing seam, component too large to test cleanly).
- For mechanical findings: auto-apply the fix per the appropriate `*-remediation-logic.md` (test side or source side), re-run affected tests, and append to `reviews/remediations-applied/<label>.md` under `## Iteration <N>` with a `Phase: 0` annotation.
- Architectural findings carry forward to Step 5; do not surface mid-iteration. Use match keys prefixed `unit-test/`.

### Step 2 — Phase 1: Code review

- **Design conformance (frontend scope only).** When `review_scope` includes frontend files (`.tsx`, `.css`, `.scss`), run the deterministic design gate first: `bash .claude/hooks/check-design-conformance.sh --web-required`. Run it from inside the slice worktree (cwd = the worktree root) so the hook self-locates via `git rev-parse --show-toplevel`; **pass `--web-required`** (frontend is in scope) so a missing/empty `web/src` FAILS loud instead of skipping. This is the design analogue of the OWASP pass — every colour and radius in component styles must trace to a design token (`var(--…)`). It scans `*.css`/`*.scss` (raw hex, raw `rgb()`/`hsl()`/`oklch()`/…, named CSS colours in colour properties, all `border-*-radius` forms) plus a conservative `*.tsx`/`*.jsx` inline-style / CSS-in-JS pass. Leading token is **`PASS` (0)** / **`FAIL` (1, blocking)** / **`SKIP` (2)**; the final line is machine-readable (`DESIGN-CONFORMANCE-RESULT: …`). A **`FAIL`** is a **blocking High finding**: record it in `code-review-findings/<label>.md` and treat it like any other High — it prevents `CLEAN` until the developer replaces the off-token values (or adds them to the token sheet and references them). With frontend in scope, **treat `SKIP`/exit 2 as blocking too** (the hook could not scan). Tests, lint, and build are blind to design fidelity; this gate is not.
- **Design fidelity — render & compare (frontend scope only, when a handoff is present).** When `review_scope` includes frontend files **and** `bash .claude/hooks/detect-design-handoff.sh` prints `DESIGN-HANDOFF: PRESENT`, walk `design-fidelity-web.md` end-to-end against the build. **This step runs FIRST in the iteration — before Phase 0's unit tests** — so a failing or un-runnable test can never gate it. **Stand the built app up** via the `/local-testing` skill (LocalDB + seeded deterministic data + the dev-only Entra auth bypass that fails closed; no cloud, no real tenant; independent of the test suite). If the app won't build or boot, **fix the blocker via the auto-remediation machinery (Phase 1/2 fixes + the architectural prompt) and retry the launch** within the iteration cap; only if it genuinely cannot be rendered, emit a **High blocking** finding under `design-fidelity-web.md#render-failed` and set status OPEN — **never silently skip**. **Tear the local stack down after the comparison** (pass or fail) and free the ports. **Source of truth:** the **prototype**. The audit is **build-vs-prototype** — for every prototyped screen it renders the prototype and the build side by side and compares them; any visual difference is a blocking finding. There is no element-contract. See `design-fidelity-web.md` § *Source of truth* + § *What the audit checks* + § *The render mechanism* + § *Adversarial brief template*. **Hard precondition:** if the detector says PRESENT but the prototype bundle `artifacts/docs/design/project/` is absent, surface a **High blocking** finding under `design-fidelity-web.md#no-prototype` and set status OPEN. **The orchestrator does NOT collect evidence itself.** It delegates to a fresh sub-agent and validates what it returns; the comparison reference is genuinely external (the user's prototype), but isolation still guards against the same-model reviewer rubber-stamping the same-model builder. **Procedure:** (1) **Enumerate (orchestrator)** — run `bash .claude/hooks/enumerate-blueprint-screens.sh`; record every screen with its Tag, **Prototype-source** file, and **App-route** (plus the synthetic `APP` and `SHELL` buckets) — the manifest must cover them all; if the hook reports `ABSENT`, surface a **High blocking** finding under `design-fidelity-web.md#missing-blueprint`. Then, for each Prototype-tagged screen, run `node .claude/hooks/enumerate-prototype-components.mjs --url <prototype-url>` (and again on the built route) to capture the **ground-truth design-system component set** (`type` + `ordinal`, matched prototype↔build by those keys) the per-component diff must cover — any `UNKNOWN-INTERACTIVE` row is a blocking finding. (2) **Delegate (orchestrator → sub-agent)** — spawn a fresh sub-agent per the "Adversarial brief template". Pass ONLY the prototype path, the built app (`web/` — start the dev server, populate with mock data the sub-agent generates), the blueprint path (screen list + Prototype-source/App-route columns + Save-for-/build specs), the token-override path (`web/src/mws/tokens.css`), the enumerate hook, and the brief — do NOT pass `architecture/`, `decisions.md`, or prior findings. The sub-agent **renders both sides via `bash .claude/hooks/render-screenshot.sh <url> <out.png> [w] [h]`** (one call per side — the hook owns the headless-browser recipe; the built-in `preview_screenshot` is unreliable), opens the two PNGs, and records each screen's comparison: `match`, or discrepancies as `{ dimension, prototype_value, build_value, verdict }` with the screenshot paths. **If the render hook exits non-zero for any in-scope screen** (no Chrome/Edge, or the dev server won't serve the route), the step is a **blocking failure** under `design-fidelity-web.md#render-failed`: set status OPEN — the gate never skips to a pass on a render it couldn't take. (3) **Validate the evidence (orchestrator)** — every Prototype-tagged screen must carry **both** a `prototype_shot` and a `build_shot` (proof it rendered both) plus a `verdict`; every Save-for-/build screen a `build_shot` + verdict; a screen claimed `match` without its renders, or a discrepancy missing its dimension/values, is `NOT REVIEWED`; a missing screen or missing `APP`/`SHELL` is `NOT REVIEWED`. **Re-walks use a fresh sub-agent — the orchestrator MUST NOT self-walk.** If validation fails, re-spawn with the gap noted; after 2 failed attempts on a screen, escalate to the architectural prompt. (4) **Score severity** — `visual-drift` / `missing-element` / `added-element` / `not-implemented` / `raw-literal` / `style-inconsistent` / `content-drift` / `NOT REVIEWED` are **blocking High**; `match` is no finding. `added-element` and `missing-element` are first-class — the build must match the prototype in both directions. (5) **Spot-check high-severity verdicts (orchestrator)** — for every discrepancy, the orchestrator **opens the referenced screenshots** (and the impl file) itself and confirms the claimed difference before accepting. Agree → accept; disagree → demote to `NOT REVIEWED — orchestrator disputes sub-agent verdict` and re-spawn (never silently downgrade to `match`). `match` screens are accepted by confirming both shots exist. (6) **Persist the evidence manifest** — build an `evidence_manifest` object (one entry per screen the enumerate hook prints plus `APP` and `SHELL`, each with `app_route` / `prototype_source` / `prototype_shot` / `build_shot` / **`enumerated_components[]`** (the component enumerator's `{ type, ordinal }` ground truth) / **`components[]`** (one record per enumerated component: `type` / `ordinal` / `verdict` / `state_shots[]` covering `hover` + `focus-visible`, plus `active` where `requires_active` / `prototype_computed` + `build_computed` — the `COMPUTED:` reads from `render-states.mjs`) / `verdict` / `discrepancies[]`), plus `blueprint_hash` and `prototype_bundle_hash`; written into the clean-run cache and re-validated by `node .claude/hooks/verify-design-fidelity-manifest.mjs . reviews/.last-clean-run.json` before `/dev-ship` can skip review. The validator **FAILs** if `components[]` omits any enumerated component, if a component lacks its `hover`/`focus-visible` (or `active`) captures, or if a component verdict is `match` while its `prototype_computed` vs `build_computed` differ beyond tolerance (px ±1px, else exact) — so whole-screen eyeballing and default-state-only comparisons cannot pass. **Tool budget:** rendering is heavier than a source read and scales with **components** — budget for starting the dev server once, then per prototyped screen both default-state shots, the component enumeration on both sides, and per enumerated component `hover` + `focus-visible` (+ `active`) captures + a computed-style read on both sides; the per-iteration cap is lifted when a handoff is present (scale with screen × component count). If exhausted, the sub-agent records the remaining components as `NOT REVIEWED — budget exhausted`. Capture a component's states in one browser launch with `node .claude/hooks/render-states.mjs --url <url> --selector <css> --states hover,focus-visible,active --out-dir <dir>` (one launch per component, not per state). Record findings in `reviews/design-fidelity-findings/<label>.md` under `## Iteration <N>`. Match-key format: `design-fidelity/<app-route>::<screen-id>/<dimension>`. The remediation loop is **render → compare → fix → re-render → re-compare** until every screen is `match`.
- Apply the basic + advanced checklists for each affected layer to every file in **`review_scope`** (changed source + changed test files).
- Classify each finding as **High**, **Medium**, or **Low**.
- Flag each finding with a **fix class**: `Mechanical` or `Architectural`.
- Append findings to `reviews/code-review-findings/<label>.md` under heading `## Iteration <N>`. Include file, line, severity, fix class, rule reference, issue, proposed fix.
- Auto-apply mechanical fixes immediately (so security review sees the post-fix state). Append to `reviews/remediations-applied/<label>.md` with `Phase: 1` annotation.
- **If the fix touched source code (not just docs, comments, or non-runtime configuration), re-run the unit tests that exercise that source file** — same scoping as Phase 0 (e.g. `dotnet test` for affected projects, `npm test -- --testPathPattern=<files>`, tSQLt on affected schemas). If a test that was passing now fails, append the failure to `reviews/unit-tests/test-failures/<label>.md` under `## Iteration <N>` tagged `Phase: 1-regression` and carry it forward as a new open finding — it will be picked up by Phase 0 of the next iteration (or trigger `Stuck` if the same fix keeps breaking the same test).

### Step 3 — Phase 2: Security review

- Walk OWASP A01–A10 + advanced / container / data-protection sections for each affected layer in `review_scope`.
- Classify each finding as **Critical**, **High**, **Medium**, or **Low**.
- Flag each finding with a **fix class**: `Mechanical`, `Architectural`, or `Pending-decision` (for product trade-offs that only the developer can make, e.g. MSAL token cache location).
- Append to `reviews/security-review-findings/<label>.md` under `## Iteration <N>`.
- Auto-apply mechanical fixes immediately. Append to `reviews/remediations-applied/<label>.md` with `Phase: 2` annotation.
- **If the fix touched source code (not just docs, comments, or non-runtime configuration), re-run the unit tests that exercise that source file** — same scoping as Phase 0. Security fixes tightening input handling, parameterization, or auth checks can plausibly change runtime behavior; treat any newly-failing test exactly as in Phase 1 above — append to `reviews/unit-tests/test-failures/<label>.md` tagged `Phase: 2-regression` and carry it forward as a new open finding.

### Step 4 — Load prior decisions and skip already-resolved findings

For every new finding from any phase, compute its match key:

```
<phase_prefix><file_path>::<rule_reference>
```

`<phase_prefix>` is `unit-test/` for Phase 0 findings and empty for Phases 1 & 2. Example: `unit-test/web/src/features/Export/ExportPanel.tsx::web-testing.md#testability-seams` or `web/src/features/ConversationSidebar/index.tsx::web-component-architecture.md#component-length`.

Cross-reference against `reviews/architectural-findings.md`:

- Match exists with status `Applied` → mark as resolved (stale finding; possibly a rule-scan false positive on a fix that hasn't propagated).
- Match exists with status `Rejected` → **silently skip** in this iteration; do not re-surface.
- Match exists with status `Deferred` → surface to developer with annotation `"Previously deferred on <date>. Still deferred?"` — giving them a second look on each new run.
- No match → treat as newly surfaced.

### Step 5 — Architectural prompt (single batched message across all phases)

Mechanical fixes for all three phases have already been auto-applied during Steps 1–3. This step handles the **architectural** findings — items that need a developer decision because they reflect a design choice, not a deterministic fix.

Batch architectural findings from Phase 0 (test-revealed design issues), Phase 1 (code-quality architectural), and Phase 2 (security architectural) into one message — sorted by severity (Critical → High → Medium → Low), tagged with phase:

```
Iteration <N> — architectural findings awaiting your decision (<count>):

[1] <finding_id> — <one-line summary>     [Phase 2 / Critical]
    File:           <file_path>
    Rule:           <rule_reference>
    Why it matters: <one-sentence why>
    Proposed fix:   <one-sentence what>
    Match key:      <prefix><file>::<rule>

[2] <finding_id> — <one-line summary>     [Phase 0 / High]
    ...

[3] ...

Reply per finding:
  "apply 1, defer 2, reject 3 (reason: ...)"
or a shortcut:
  "apply all"
  "defer all"
  "reject all"
```

Parse the reply. For each finding:

- **Apply** → implement the fix, verify (re-run affected tests for Phase 0 fixes), record `Applied` in the ledger + remediation log.
- **Defer** → record `Deferred` in the ledger; include the date; finding will be re-proposed on the next run.
- **Reject** → record `Rejected` + optional reason in the ledger; finding will never be re-raised for the same match key until the ledger entry is manually cleared.

If the developer does not reply, the iteration pauses indefinitely. Findings stay `Pending` in the iteration log. Resuming the session with another invocation re-surfaces them.

#### 5a — Pending-decision findings: surface without fix

Security findings with product trade-offs (e.g. MSAL localStorage vs sessionStorage) are presented similarly but without a pre-written fix — they need the developer to pick a direction. Responses `approve A` or `approve B` unblock, with the chosen fix applied on the next iteration.

### Step 6 — Update the architectural ledger

`reviews/architectural-findings.md` is the canonical, append-only ledger of every architectural finding that has ever surfaced. Every row has:

```
| Match Key | First Seen | Status | Decided At | Rule | File | Reason |
|-----------|------------|--------|------------|------|------|--------|
| web/src/.../ConversationSidebar/index.tsx::web-component-architecture.md#component-length
| 2026-04-23 | Rejected | 2026-04-23 | component-length | web/.../index.tsx | "Split is premature; revisit after messages slice." |
```

After the iteration, **regenerate** `reviews/deferred-architectural.md` as the filtered view of all rows with `Status = Deferred`. This is a view file — never hand-edited.

### Stop conditions (evaluated at end of each iteration)

Stop the loop when any of the following is true:

1. **Clean** — zero open findings of any severity or class, including zero open design-fidelity findings AND zero `NOT REVIEWED` screens (when Phase 1's design-fidelity step ran). "Open" excludes findings in `Applied`, `Rejected`, or `Deferred` status from prior decisions in this run or prior runs. The blocking design-fidelity verdicts are `visual-drift` / `missing-element` / `added-element` / `not-implemented` / `raw-literal` / `style-inconsistent` / `content-drift` / `NOT REVIEWED`; the remediation loop is render → compare → fix → re-render until every screen is `match`. **Cache-write integrity check (required when design-fidelity ran):** immediately before writing `.last-clean-run.json`, re-run `bash .claude/hooks/enumerate-blueprint-screens.sh` and run the manifest hook with the dev-tree cache path as the second argument (the hook's default is the analyst path; passing it explicitly is required in the dev workflow): `node .claude/hooks/verify-design-fidelity-manifest.mjs . reviews/.last-clean-run.json`. The manifest hook must print `MANIFEST: VALID` and exit 0. The cache MUST include `schema_version` (currently `"3.0"`), the `evidence_manifest` object (one per-screen comparison record per Prototype-tagged screen plus `APP` and `SHELL` — each with `app_route` / `prototype_source` / `prototype_shot` / `build_shot` / **`enumerated_components[]`** + **`components[]`** (one record per enumerated component: `type` / `ordinal` / `verdict` / `state_shots[]` covering `hover` + `focus-visible`, plus `active` where `requires_active` / `prototype_computed` + `build_computed`) / `verdict` / `discrepancies[]`), the `coverage_disclosure` block (`checked`, `not_checked`, `least_confident`), AND both `blueprint_hash` and `prototype_bundle_hash`. **A `not_checked` list containing "components" or "interaction states" is blocking when a handoff is present** — the validator FAILs a Prototype-tagged screen whose `components[]` omits an enumerated component or whose components lack their state captures / computed reads, so whole-screen eyeballing and default-state-only comparisons can never reach CLEAN. The validator recomputes both hashes and reports STALE on mismatch, catching a blueprint edit or a prototype re-export mid-loop. The validator is pure Node — no `jq` or other system-tool dependency. If any of these checks fails, abort the cache write and set status `OPEN`. The cache is never written from partial work. This is the success path.
2. **Stuck** — the set of open-finding match keys at end of iteration N is identical to the set at end of iteration N-1. This indicates remediation is not reducing the problem set (e.g. a fix introduces the same issue in a new form). Stop and escalate.
3. **Cap** — iteration count == `MAX_ITERATIONS`. Stop and escalate.

On escalate (`Stuck` or `Cap`): write `## Final Status: UNRESOLVED` to the iteration log with the open findings list, and surface a summary to the developer.

**Next step on CLEAN:** Surface a single-line prompt — _"Review CLEAN. Run `/dev-ship` to commit, merge into `dev`, and push."_ — and **STOP**. On `Stuck`/`Cap`, do **not** suggest `/dev-ship`; tell the developer to resolve the open findings and re-run `/dev-review-and-remediate`.

---

## Output contract

After a successful run, the following paths exist / are updated:

```
reviews/
├── code-review-findings/<label>.md         (one file per run; per-iteration sections)
├── security-review-findings/<label>.md     (one file per run; per-iteration sections)
├── design-fidelity-findings/<label>.md     (one file per run, when Phase 1 design-fidelity ran; per-iteration sections)
├── remediations-applied/<label>.md         (one file per run; per-iteration sections; rows tagged Phase: 0|1|2)
├── unit-tests/
│   ├── tests-added/<label>.md              (one file per run; tests created or extended per iteration)
│   └── test-failures/<label>.md            (one file per run; failures + coverage gaps per iteration)
├── iteration-log/<label>.md                (one file per run; iteration-by-iteration record)
├── architectural-findings.md               (cumulative ledger; append-only; unit-test rows prefixed `unit-test/`)
├── deferred-architectural.md               (auto-regenerated view of `Deferred` rows)
├── .watermark.json                         (atomic update at end of run, only if HEAD moved)
└── .last-clean-run.json                    (cache file consumed by /dev-ship; written ONLY on CLEAN status)
```

### `.last-clean-run.json` cache file (consumed by `/dev-ship`)

Written atomically at the end of a run that finishes with status `CLEAN`. Used by `/dev-ship` to skip re-running reviews when the slice has already been gated and nothing has changed since:

```json
{
  "label": "feat-export-pdf-a3f7e2c",
  "head_sha": "<git rev-parse HEAD>",
  "diff_hash": "<sha256 of `git diff HEAD` output>",
  "completed_at": "<ISO 8601 UTC>",
  "phases_run": ["unit-tests", "dev-code-review", "dev-security-review"],
  "max_severity_reached": "Low"
}
```

`/dev-ship` reads this file at its test gate (step 4), recomputes `git diff HEAD`'s SHA-256, and skips re-invoking `/dev-review-and-remediate` — proceeding straight to commit, merge, and push — when **all** of these are true:

1. The file exists.
2. `head_sha` matches current `git rev-parse HEAD`.
3. `diff_hash` matches the SHA-256 of current `git diff HEAD`.
4. `completed_at` is within the last 60 minutes.

If any check fails, `/dev-ship` re-invokes `/dev-review-and-remediate` before continuing. The cache file is never written on `UNRESOLVED-*` status — failed runs cannot exempt `/dev-ship` from re-running the gate.

### Iteration log structure

```markdown
# <label> — iteration log

**Label:** feat-conversations-crud-a3f7e2c
**Scope source:** watermark (a3f7e2c..HEAD)
**Files reviewed:** 28
**Started:** 2026-04-23T14:30:00Z
**Ended:** 2026-04-23T14:34:12Z
**Final status:** CLEAN | UNRESOLVED-STUCK | UNRESOLVED-CAP

## Iteration 1 — <N_C> code findings, <N_S> security findings
- Auto-applied: <M_list>
- Architectural surfaced: <A_list>
- Developer decisions: apply 1,3; defer 2; reject 4 (reason: ...)
- End-of-iteration open set: <hash>

## Iteration 2 — ...

## Final Status: CLEAN
- Total iterations: 2
- Total findings fixed: 8
- Architectural deferred: 1
- Architectural rejected: 1
```

---

## Watermark lifecycle

- **Read** during pre-flight — determines scope.
- **Written atomically** at the end of every run that completes with status `CLEAN` or `UNRESOLVED-<kind>` **only if the current HEAD SHA differs from the last watermarked SHA**.

Why the "only if HEAD moved" condition: running the skill pre-commit doesn't advance HEAD. Updating the watermark pre-commit would effectively say "I've reviewed everything up to `A`" even though `A` is the same as last time — no information gain, and it would mis-attribute the next run's scope. By only moving the watermark when HEAD has moved, we keep the watermark meaningfully aligned with committed history.

New watermark:
```json
{
  "last_head_sha": "<current HEAD SHA>",
  "last_run_timestamp": "<ISO 8601 UTC>",
  "last_label": "<label>",
  "last_status": "clean | unresolved-stuck | unresolved-cap"
}
```

**Do not update the watermark** if the run aborted before completing iteration 1 (e.g. scope was empty, or the developer interrupted before the first findings were recorded). This preserves scope continuity — the next run will pick up where this one started.

### `.last-clean-run.json` lifecycle

- **Written** only at end-of-run when status is `CLEAN`. Written atomically (write to temp file, rename).
- **Not written** on `UNRESOLVED-STUCK` or `UNRESOLVED-CAP` — a failed run must not exempt `/dev-ship` from re-running reviews.
- **Read** by `/dev-ship` (not by this skill itself).
- **Invalidated implicitly** by HEAD movement, diff change, or 60-minute expiry — no explicit cleanup required.
- **Safe to delete manually** at any time; doing so simply forces `/dev-ship` to re-run its own reviews.

---

## Edge cases

| Case | Behaviour |
|---|---|
| No watermark file | First-run mode: fall back to `git diff --name-only`; auto-label from branch or wip-stamp. |
| Watermark SHA no longer exists | Warn, ignore watermark, fall back to `git diff --name-only`. Suggest developer commit and re-run. |
| Empty scope after filtering | Exit with "Nothing to review — no changes since `<last_label>`." No files written. Watermark not updated. |
| Label collision without `--force` | Abort with clear error; suggest `--force` or `--label`. |
| Developer reply is ambiguous on architectural findings (e.g. `"approve"` without numbers) | Ask for clarification; do not guess. |
| Remediation introduces a new finding of the same kind (oscillation) | Detected by the `Stuck` stop condition. Escalate. |
| Rule file changed between iterations | Rule reference in match key is stable as a path; if the rule file is renamed, match-key lookup will miss and the finding will surface fresh. This is correct behaviour — the rule changed. |
| Architecture doc update required during remediation | Stop. Update the relevant `artifacts/docs/dev/architecture/` file first, surface the change to the developer, wait for explicit acknowledgement before proceeding. |

---

## What this command does NOT do

- Does **not** commit, push, or open a PR. Stops at the review/fix boundary. Compose with `/dev-ship` afterwards.
- Does **not** run in the background. Architectural decisions require a live developer; attempting to run unattended with architectural findings present will stall at the first decision prompt.
- Does **not** touch `artifacts/docs/dev/architecture/`, `/shared/`, or any locked signature without first updating the architecture doc and surfacing the change.
- Does **not** clear rejections automatically. Manually remove entries from `reviews/architectural-findings.md` if you want a previously-rejected finding reconsidered.

---

## Resume behaviour

If the run is interrupted (developer closes the session mid-iteration):

- Files already written to `reviews/` stay on disk.
- Code edits already applied stay applied.
- Watermark is **not** updated (only written at end-of-run).
- Re-invoking the skill with no arguments resumes from the same scope (watermark still points to the previous baseline). The new run starts from iteration 1 against the same file set, which is safe: previously-applied fixes won't re-trigger (they resolved the rule), and pending architectural decisions re-surface because the ledger shows them as still open.
