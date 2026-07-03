# `/dev-review-and-remediate` — Quickstart

Bounded **test-run + review + remediation** pipeline. One skill, one bounded loop:

1. Runs the unit tests authored by `/dev-build-application` (extends only if a required case is missing)
2. Runs code review
3. Runs security review

…then auto-fixes mechanical findings across all three (test bugs, source bugs surfaced by tests, code quality, security), pauses for your decision on anything architectural — **one batched prompt per iteration covering all three phases** — and records everything under `reviews/`. Replaces the per-slice review gate that used to live in `/dev-build-application`.

**Test authoring stays in `/dev-build-application`.** This skill verifies coverage, runs the tests, and remediates failures. It only writes a test when the slice missed a required case — that's a slice-authoring gap and surfaces as a finding.

## Invoke

```
/dev-review-and-remediate
```

No arguments needed. Scope and filenames are derived from your git state.

## What happens

1. **Pre-flight** — skill reads architecture docs, `/shared/` contracts, the layer-specific testing rules + templates, the layer-specific review checklists, the remediation logic, and the prior architectural-findings ledger so it knows what's already been decided.
2. **Iteration 1** — runs three phases in order, mechanical fixes auto-apply between phases:
   - **Phase 0** — runs the tests `/dev-build-application` already authored. Extends only when a required case is missing (per the layer's testing rules). Auto-fixes mechanical (test bugs, source bugs surfaced by correctly-written tests). Frontend uses `npm test`; API uses `dotnet test`; database uses tSQLt.
   - **Phase 1** — code review against the post-test source. Auto-fix mechanical (naming, missing attribute, `ConfigureAwait`, etc.).
   - **Phase 2** — security review against the post-Phase-1 source. Auto-fix mechanical (sanitization, header config, etc.).
3. **Architectural prompt** — if any phase surfaced architectural findings, the skill pauses and shows them as **one batched, severity-sorted, phase-tagged list**. Reply per finding:
   - `apply 1, apply 3` — skill implements the fix
   - `defer 2` — skill logs it, re-proposes on your next run
   - `reject 4 (reason: ...)` — skill logs it, never asks again for this file+rule
   - Shortcuts: `apply all` / `defer all` / `reject all`
4. **Iterations 2–5** — re-runs all three phases to verify fixes landed and catch anything introduced by remediation. Stops on clean, stuck, or cap.
5. **Outputs** — permanent artefacts under `reviews/`:
   - `code-review-findings/<label>.md` — per-run code review
   - `security-review-findings/<label>.md` — per-run OWASP review
   - `unit-tests/tests-added/<label>.md` — per-run tests created or extended
   - `unit-tests/test-failures/<label>.md` — per-run failures + coverage gaps
   - `remediations-applied/<label>.md` — per-run fix log (rows tagged `Phase: 0|1|2`)
   - `iteration-log/<label>.md` — iteration-by-iteration summary
   - `architectural-findings.md` — cumulative ledger of every architectural decision (unit-test rows prefixed `unit-test/`)
   - `deferred-architectural.md` — auto-filtered view of items still deferred
   - `.last-clean-run.json` — cache that lets `/dev-ship` skip duplicate reviews (see below)

## A typical session, start to finish

**1. Finish a slice.** You've been coding on a feature. Files are staged, unstaged, or a mix — doesn't matter. You don't have to commit first.

**2. Invoke the skill.**
```
/dev-review-and-remediate
```

**3. Pre-flight runs silently** (3–7 seconds). Skill reads the architecture docs, loads only the rules + checklists + test templates matching the layers you touched, reads the prior architectural-findings ledger so previously-decided findings aren't re-raised, and figures out scope from `git diff` + `git status`. Auto-generates a label (e.g. from branch `feat/pdf-export` → `feat-pdf-export-a3f7e2c`).

**4. Phases 0 → 1 → 2 run.** You see something like:

```
Iteration 1 — scoped to 4 files (label: feat-pdf-export-a3f7e2c)

Phase 0 — Unit tests
 Tests added:    2 new files (ExportServiceTests.cs, ExportPanel.test.tsx)
 Tests extended: 1 file (PdfRendererTests.cs — added boundary case)
 Failures:       2 (1 High, 1 Medium)
 Auto-fixed: ✓ off-by-one in PdfRenderer.RenderPage  ✓ missing await in test setup

Phase 1 — Code review
 Findings: 3 (1 High, 2 Medium)
 Auto-fixed: ✓ [RequestSizeLimit] on ExportController  ✓ ConfigureAwait on 3 awaits

Phase 2 — Security review
 Findings: 0

1 architectural finding awaiting your decision:

[1] U.A.1 — ExportPanel.tsx requires deep mocking to test (12 collaborators).   [Phase 0 / High]
    File:           web/src/features/Export/ExportPanel.tsx
    Rule:           web-testing.md#testability-seams
    Why it matters: Tests become brittle and don't actually verify behaviour.
    Proposed fix:   Extract data-fetching into a hook so the component can be tested with shallow props.
    Match key:      unit-test/web/src/features/Export/ExportPanel.tsx::web-testing.md#testability-seams

Reply per finding:
  "apply 1"     — I implement the fix now
  "defer 1"     — log it, re-propose on your next run
  "reject 1 (reason: ...)"  — log it, never re-raise for this file+rule
```

**5. Reply with a one-liner.** Any of these work:

- `apply 1`
- `defer 1`
- `reject 1 (reason: throwaway component, will be replaced next sprint)`
- Shortcuts when there are many: `apply all`, `defer all`, `reject all`

**6. Skill applies your decision and re-scans** (iteration 2). All three phases re-run to confirm fixes landed and didn't regress anything. If clean, it stops. Otherwise it loops up to 4 more times (max 5 iterations). For frontend scope, after the loop closes, the skill runs `npm run test:coverage` to confirm the 80% threshold.

**7. Final summary:**

```
✅ Test + review + remediation complete — feat-pdf-export-a3f7e2c

Iterations: 2 of 5 (CLEAN)
Phase 0 — Tests added: 2 files / 14 cases.  Mechanical fixes: 2 (1 source bug, 1 test bug)
Phase 1 — Code findings fixed: 3 (1 High, 2 Medium)
Phase 2 — Security findings: 0
Architectural decisions: 1 Applied, 0 Deferred, 0 Rejected
Coverage (web): 82% (threshold 80%) ✓

Cache: reviews/.last-clean-run.json  →  /dev-ship will skip duplicate reviews for the next 60 min as long as the diff doesn't change.

Full details:
  reviews/iteration-log/feat-pdf-export-a3f7e2c.md

Ready to /dev-ship.
```

**8. Ship.** Run `/dev-ship`. Because `.last-clean-run.json` exists, the diff hasn't changed, and the run completed less than 60 min ago, `/dev-ship` skips re-running `/dev-review-and-remediate` and proceeds straight to the commit, merge into `dev`, and push — no double-payment.

Zero arguments to remember. The only thing you actively decide is **apply / defer / reject** on each architectural finding — everything else is automatic.

## When to run it

Per slice, between "I think I'm done with this chunk" and "I'm about to commit." The skill is the **slice-completion gate** — `/dev-build-application` no longer runs reviews or tests inside the slice; you invoke this skill afterwards. Works pre-commit (uncommitted changes) and post-commit (recent commits since the last run).

## Common overrides (rarely needed)

| Flag | When you'd use it |
|---|---|
| `--label my-name` | Override the auto-generated filename prefix. |
| `--scope files:path/**` | Re-test/review a specific area on demand. |
| `--scope since:2026-04-15` | Test/review everything changed since a date. |
| `--force` | Overwrite existing output files with the same label. |
| `--max-iterations 3` | Shrink the 5-iteration default. |

## Pairs well with

- [`/dev-build-application`](../dev-build-application/SKILL.md) — implement slices; this skill is its post-slice gate.
- [`/dev-unit-test-and-remediate`](../dev-unit-test-and-remediate/SKILL.md) — unit-only ad-hoc when you don't want code/security review.
- [`/dev-code-review`](../dev-code-review/SKILL.md) — standalone code review, no remediation loop.
- [`/dev-security-review`](../dev-security-review/SKILL.md) — OWASP pass only.
- [`/dev-remediation`](../dev-remediation/SKILL.md) — apply a fix to a specific finding.
- [`/dev-ship`](../dev-ship/SKILL.md) — end-of-slice ship workflow; reads this skill's cache to skip duplicate reviews.

## Full contract

See [`SKILL.md`](SKILL.md) for the complete spec — pre-flight, scope derivation, label heuristic, three-phase iteration loop, watermark + cache-file semantics, stop conditions, edge cases.
