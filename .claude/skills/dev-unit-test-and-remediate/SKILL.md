---
name: dev-unit-test-and-remediate
description: Bounded loop — generate or extend unit tests for changed source, run them, auto-remediate Low/Medium/High mechanical fixes (test bugs and source bugs surfaced by tests), pause only for architectural decisions. Mirrors /dev-review-and-remediate. Unit only — not integration, E2E, or QA.
version: "1.0"
---

# /dev-unit-test-and-remediate — Bounded unit-test + remediation loop

Generates or extends unit tests for in-scope source files, runs them, and runs a **bounded remediation loop** (max 5 iterations) that auto-applies Low/Medium/High mechanical fixes and pauses only for **architectural** fixes. Records every action under `reviews/unit-tests/`. Unit only — compose with `/dev-code-review`, `/dev-security-review`, or `/dev-review-and-remediate` for other concerns.

---

## Invocation

`/dev-unit-test-and-remediate` (zero-arg; scope and label derive from git state, identical to `/dev-review-and-remediate`).

| Flag | Effect |
|---|---|
| `--label <string>` | Override auto-generated label. |
| `--scope files:<glob>` | Override scope to a literal glob. |
| `--scope since:<date>` | Override scope to files changed since ISO date. |
| `--force` | Overwrite existing per-run output files on label collision. |
| `--max-iterations <n>` | Override the default 5-iteration cap. |

---

## Pre-flight

1. **Load context.** Read `artifacts/docs/dev/architecture/README.md` + every numbered doc under `artifacts/docs/dev/architecture/`. Read the full `shared/` tree.
2. **Load test rules + templates** for layers in scope:
   - API (`.cs`, `Program.cs`, `appsettings*.json`) → `.claude/rules/dev/api-testing-guidelines.md` + `.claude/skills/dev-unit-test-and-remediate/api-unit-tests.md`. If `document-pipeline` is present, also `.claude/rules/dev/document-pipeline/api-pipeline-tests.md`.
   - Database (`.sql`, `database/migrations/**`) → `.claude/rules/dev/database-testing.md` + `.claude/skills/dev-unit-test-and-remediate/database-unit-tests.md`.
   - Frontend (`.ts`, `.tsx`, `.scss`, `.css`) → `.claude/rules/dev/web-testing.md` + `.claude/rules/design/accessibility.md` + `.claude/skills/dev-unit-test-and-remediate/web-unit-tests.md`.
3. **Load remediation logic** — `.claude/skills/dev-remediation/SKILL.md` and the layer-specific `*-remediation-logic.md` files matching scope, for fixing source bugs surfaced by tests.
4. **Load prior decisions.** Read `reviews/architectural-findings.md` (shared with `/dev-review-and-remediate`); build `<file + rule> → decision` map. Unit-test findings use match keys prefixed `unit-test/` to avoid collision with code-review entries. Previously-rejected ones are silently skipped this run.

---

## Scope derivation

Identical to `/dev-review-and-remediate` (watermark diff ∪ uncommitted, with `--scope` overrides and auto-label fallback chain) with two differences:

- Watermark file is `reviews/.watermark.unit-tests.json` — separate so the two skills run independently.
- Filter additionally drops existing test files (`*Tests.cs`, `*.test.ts`, `*.test.tsx`, `test_*.sql`) — tests are this skill's *output*, not its input.
- Empty scope after filtering → exit cleanly, no output, watermark untouched.

---

## Iteration loop

Run iterations 1..MAX_ITERATIONS (default 5). Each iteration is one full pass of the steps below; evaluate stop conditions at the end.

### Step 1 — Plan tests

For each in-scope source file, decide per the matching `*-unit-tests.md`:

- **No test exists** → create from the supporting-file template.
- **Test exists but is missing required cases** (per `api-testing-guidelines.md` always-test list, `database-testing.md` AAA scenarios, `web-testing.md` accessibility + behaviour cases) → extend.
- **Test exists and is complete** → leave alone.

Never delete or replace passing tests.

### Step 2 — Generate / extend tests, then run

Apply test changes per layer, then run scoped to changed tests:

- API → `dotnet test` for affected projects.
- Database → tSQLt on affected schemas.
- Frontend → `npm test -- --testPathPattern=<files>`. After the loop closes, run `npm run test:coverage` once. If branches/lines/etc. land in **[78%, 80%)**, do **not** add tests to close the gap — record the uncovered branches under "Coverage gaps accepted" in the slice doc (or the `slice-plan.md` timing row when no slice doc is written) and exit clean. Only re-enter the loop if a *behaviour case* required by `web-testing.md` is missing, or coverage falls below 78%.

Append generated/extended test list to `reviews/unit-tests/tests-added/<label>.md` and failures/gaps to `reviews/unit-tests/test-failures/<label>.md`, both under `## Iteration <N>`.

### Step 3 — Classify findings

Each finding gets:
- **Severity** — Low / Medium / High / Critical (Critical reserved for security-relevant bugs surfaced by tests, e.g. boundary case exposing an auth bypass).
- **Fix class** — `Mechanical` (deterministic test fix, missing required case, broken assertion, or a source bug with a clear remediation per the layer's `*-remediation-logic.md`) or `Architectural` (test reveals a design issue: tight coupling, untestable singleton, missing seam, contract change, component too large to test cleanly).

Cross-reference each `unit-test/<file>::<rule>` match key against `reviews/architectural-findings.md` — `Applied` marks resolved, `Rejected` is silently skipped, `Deferred` surfaces with `"Previously deferred on <date>. Still deferred?"`, and no match is newly surfaced.

### Step 4 — Remediate

In severity order (Critical → High → Medium → Low):

#### 4a — Mechanical fixes: auto-apply (Low / Medium / High / Critical)

**All mechanical findings auto-apply, including High and Critical. No developer prompt.**

- Fix the test (missing assertion, missing required case, broken setup, boundary value) **or** fix the source per the layer's `*-remediation-logic.md` if the test surfaced a real bug.
- Re-read the file after edit; re-run affected tests to confirm the fix resolved the failure without introducing new ones.
- Append to `reviews/unit-tests/remediations-applied/<label>.md` under `## Iteration <N>`.

#### 4b — Architectural fixes: surface and wait

After all mechanical fixes are applied and re-verified, batch architectural findings into one developer prompt — same shape as `/dev-review-and-remediate`:

```
Iteration <N> — architectural test findings awaiting your decision (<count>):

[1] <finding_id> — <one-line summary>
    File:           <file_path>
    Rule:           <rule_reference>
    Why it matters: <one sentence>
    Proposed fix:   <one sentence>
    Match key:      unit-test/<file>::<rule>

Reply per finding: "apply 1, defer 2, reject 3 (reason: ...)"
Or shortcut:        "apply all" / "defer all" / "reject all"
```

Apply / Defer / Reject semantics, ledger updates, and re-prompt-on-resume are identical to `/dev-review-and-remediate`.

### Step 5 — Update the architectural ledger

`reviews/architectural-findings.md` is shared with `/dev-review-and-remediate`; unit-test rows use match keys prefixed `unit-test/`. Regenerate `reviews/deferred-architectural.md` after the iteration.

### Stop conditions

1. **Clean** — zero open findings (`Applied`/`Rejected`/`Deferred` excluded). All tests pass, coverage thresholds met, no open architectural findings. Success.
2. **Stuck** — open match-key set unchanged from previous iteration. Escalate.
3. **Cap** — iteration count == `MAX_ITERATIONS`. Escalate.

On escalate: write `## Final Status: UNRESOLVED-<kind>` to the iteration log with the open list and surface a summary.

---

## Output contract

```
reviews/unit-tests/
├── tests-added/<label>.md            (per-iteration — tests created or extended)
├── test-failures/<label>.md          (per-iteration — failures + coverage gaps)
├── remediations-applied/<label>.md   (per-iteration — mechanical fixes applied)
├── iteration-log/<label>.md          (iteration record — same shape as /dev-review-and-remediate)
└── .watermark.unit-tests.json        (atomic write at end of run, only if HEAD moved)

reviews/architectural-findings.md     (shared ledger; unit-test rows prefixed `unit-test/`)
reviews/deferred-architectural.md     (auto-regenerated view across both skills)
```

Watermark lifecycle, collision handling, resume behaviour, and edge cases (missing watermark, history rewrite, ambiguous reply, oscillation, mid-iteration interrupt) are identical to `/dev-review-and-remediate`. Defer to its contract.

---

## What this skill does NOT do

- Run integration, E2E, contract, or QA flows; commit, push, or open a PR.
- Modify `artifacts/docs/dev/architecture/`, `/shared/`, or locked signatures without surfacing the change first.
- Delete or replace passing tests; lower coverage thresholds to terminate the loop; auto-apply architectural fixes.
