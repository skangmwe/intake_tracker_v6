# `/dev-unit-test-and-remediate` — Quickstart

Bounded unit-test + remediation pipeline. Generates or extends unit tests for your changed source files, runs them, auto-fixes mechanical failures (test bugs *and* source bugs surfaced by tests), pauses for your decision on anything architectural, and records everything under `reviews/unit-tests/`.

## Invoke

```
/dev-unit-test-and-remediate
```

No arguments needed. Scope and filenames are derived from your git state — same heuristic as `/dev-review-and-remediate`.

## What happens

1. **Pre-flight** — skill reads the architecture docs, `/shared/` contracts, the layer-specific testing rules + templates (api / database / web), the remediation logic for source bugs, and the prior architectural-findings ledger so previously-decided findings aren't re-raised.
2. **Iteration 1** — for each in-scope source file, plans tests (create / extend / leave alone), generates or extends them, then runs the suite scoped to changed tests:
   - API → `dotnet test`
   - Database → tSQLt on affected schemas
   - Frontend → `npm test -- --testPathPattern=<files>`

   Auto-applies all mechanical fixes (missing assertion, broken setup, boundary case, or a source bug with a clear remediation in the layer's `*-remediation-logic.md`) — **including High and Critical**. No developer prompt for mechanical fixes.
3. **Architectural prompt** — if a test reveals a design issue (tight coupling, untestable singleton, missing seam, component too large to test cleanly), the skill pauses and shows a numbered list. Reply per finding:
   - `apply 1, apply 3` — skill implements the fix
   - `defer 2` — skill logs it, re-proposes on your next run
   - `reject 4 (reason: ...)` — skill logs it, never asks again for this file+rule
   - Shortcuts: `apply all` / `defer all` / `reject all`
4. **Iterations 2–5** — re-runs tests to verify fixes landed and catch anything introduced by remediation. Stops on clean, stuck, or cap.
5. **Outputs** — permanent artefacts under `reviews/unit-tests/`:
   - `tests-added/<label>.md` — per-iteration tests created or extended
   - `test-failures/<label>.md` — per-iteration failures + coverage gaps
   - `remediations-applied/<label>.md` — per-iteration mechanical fixes
   - `iteration-log/<label>.md` — iteration-by-iteration summary

   Plus the shared ledger (rows prefixed `unit-test/` to avoid collision with code-review entries):
   - `reviews/architectural-findings.md` — cumulative ledger of every architectural decision
   - `reviews/deferred-architectural.md` — auto-filtered view of items still deferred

## A typical session, start to finish

**1. Finish a chunk of work.** You've added or modified some source files. Staged, unstaged, or a mix — doesn't matter. You don't have to commit first.

**2. Invoke the skill.**
```
/dev-unit-test-and-remediate
```

**3. Pre-flight runs silently** (2–5 seconds). Skill reads the architecture docs, loads only the testing rules + templates matching the layers you touched, reads the prior architectural-findings ledger so previously-decided findings aren't re-raised, and figures out scope from `git diff` + `git status` (existing test files are filtered out — tests are this skill's *output*). Auto-generates a label (e.g. from branch `feat/pdf-export` → `feat-pdf-export-a3f7e2c`).

**4. Tests are generated, run, and remediated.** You see something like:

```
Iteration 1 — scoped to 3 files (label: feat-pdf-export-a3f7e2c)

Tests added:    2 new test files (ExportServiceTests.cs, ExportPanel.test.tsx)
Tests extended: 1 file (PdfRendererTests.cs — added boundary case)
Test failures:  2 (1 High, 1 Medium)

Auto-applying 2 mechanical fixes...
 ✓ Fixed off-by-one in PdfRenderer.RenderPage — boundary case revealed real source bug
 ✓ Added missing await in ExportServiceTests setup — test bug

1 architectural finding awaiting your decision:

[1] U.A.1 — ExportPanel.tsx requires deep mocking to test (12 collaborators).
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
- `reject 1 (reason: component is throwaway, will be replaced next sprint)`
- Shortcuts when there are many: `apply all`, `defer all`, `reject all`

**6. Skill applies your decision and re-scans** (iteration 2). Re-runs the affected tests to confirm the fix didn't regress anything. If clean, it stops. Otherwise it loops up to 4 more times (max 5 iterations). After the loop closes for frontend scope, it runs `npm run test:coverage` to confirm 80% thresholds.

**7. Final summary:**

```
✅ Unit-test + remediation complete — feat-pdf-export-a3f7e2c

Iterations: 2 of 5 (CLEAN)
Tests added:             2 files, 14 cases
Tests extended:          1 file, 3 cases
Mechanical fixes:        2 (1 source bug, 1 test bug)
Architectural decisions: 1 Applied, 0 Deferred, 0 Rejected
Coverage:                82% (threshold 80%) ✓

Full details:
  reviews/unit-tests/iteration-log/feat-pdf-export-a3f7e2c.md

Ready to /dev-ship (which will run /dev-review-and-remediate for code + security review before committing).
```

**8. Ship.** Run `/dev-ship`. Since this skill only covered unit tests, `/dev-ship`'s test gate will invoke `/dev-review-and-remediate` to add the code-review and security-review passes before committing.

Zero arguments to remember. The only thing you actively decide is **apply / defer / reject** on each architectural finding — everything else is automatic.

## When to run it

Any time between "I think I'm done with this chunk of work" and "I'm about to commit." Works both **pre-commit** (against your uncommitted changes) and **post-commit** (against recent commits since the last run). The skill detects which mode it's in from `git status` and uses a separate watermark (`.watermark.unit-tests.json`) so it runs independently of `/dev-review-and-remediate`.

Unit only — for integration, E2E, contract, or QA flows, use the appropriate dedicated skill.

## Common overrides (rarely needed)

| Flag | When you'd use it |
|---|---|
| `--label my-name` | Override the auto-generated filename prefix. |
| `--scope files:path/**` | Re-test a specific area on demand. |
| `--scope since:2026-04-15` | Test everything changed since a date. |
| `--force` | Overwrite existing output files with the same label. |
| `--max-iterations 3` | Shrink the 5-iteration default. |

## Pairs well with

- [`/dev-review-and-remediate`](../dev-review-and-remediate/SKILL.md) — **the recommended slice-completion gate.** Composes this skill as its Phase 0, then adds code review and security review in one bounded loop. For full-stack slice gating, prefer `/dev-review-and-remediate`. Use this skill standalone only when you want **unit tests only** with no code/security review (rare — e.g. backfilling tests on legacy code).
- [`/dev-code-review`](../dev-code-review/SKILL.md) — standalone code review without remediation.
- [`/dev-security-review`](../dev-security-review/SKILL.md) — OWASP pass only.
- [`/dev-remediation`](../dev-remediation/SKILL.md) — apply a fix to a specific finding.
- [`/dev-ship`](../dev-ship/SKILL.md) — end-of-slice ship workflow, to follow after this skill clears (it will add code + security review via `/dev-review-and-remediate`).

## Full contract

See [`SKILL.md`](SKILL.md) for the complete spec — pre-flight loads, scope derivation, iteration loop, classification, watermark semantics, stop conditions, output contract, and the layer-specific test templates ([`api-unit-tests.md`](api-unit-tests.md), [`database-unit-tests.md`](database-unit-tests.md), [`web-unit-tests.md`](web-unit-tests.md)).
