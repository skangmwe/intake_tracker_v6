# slice-users-access-4a32c37 — iteration log

**Label:** slice-users-access-4a32c37
**Scope source:** uncommitted slice-17 diff on `slice/users-access`
**Layers in scope:** database (procs + tSQLt), api (`Users` module), web (`features/users`), shared types.
**Started:** 2026-07-06 (slice-completion gate)

## Iteration 1

### Ran and green
- **Design-conformance gate** (`check-design-conformance.sh --web-required`) → **PASS** (`files_scanned=220 violations=0`). New `users.css` + touched `.tsx` are token-clean.
- **API tests** (`dotnet test`, full) → **432/433 pass**. Scoped Members tests **22/22**. The 1 failure (`HealthTests`) reproduces on base `dev` — pre-existing, unrelated (documented slice-13).
- **Web tests** (`jest --coverage`, full, isolated) → **748/748 pass, 138/138 suites**. Slice-17 users feature **27/27**. (A concurrent-load run showed one `FieldEditorSheet` timeout; isolation confirmed it green — contention artifact.)
- **Builds** — API + API.Tests build clean; web `tsc --noEmit` has 0 new errors (13 pre-existing slice-6/8/11/12 test-file errors unchanged).
- **Code review** — no High/Critical; 2 Low accepted (unpaginated admin `GET /members` per approver-team precedent; inline JSON options nit).
- **Security review** — OWASP A01–A10 **CLEAN** (WorkspaceAdmin-gated, 403≠404, parameterized SQL, no PII in logs/event payloads, no new deps).

### Auto-applied (Phase 0, mechanical)
- Fixed a **test-setup bug** in `UsersAccessPage.test.tsx` (mocked `fetchMe`→undefined errored the seeded `/users/me` query). Source was correct. Re-verified 27/27.

### NOT executed this pass (heavyweight / not applicable)
- **tSQLt `RunAll`** — assertion framework not vendored (same as every prior slice). 3 test files authored to pattern; slice adds **no migrations** (3 `CREATE OR ALTER` procs), so no schema-deploy delta. Full real-engine DB standup deferred per earlier-slice precedent.
- **Design-fidelity render-and-compare** — **not run: S29 is `[deferred]`/non-prototyped**, so this diff changes **no prototyped screen** and has no design drift for the render pipeline to catch; the deterministic token/radius gate PASSED. Matches slice-6 / slice-13 practice. No `evidence_manifest` produced.

### Architectural finding surfaced to developer (awaiting decision)
```
[1] coverage-debt — global web coverage below the 80% floor        [Phase 0 / Medium]
    Numbers:  branch 76.05%, func 78.72% (stmts 86.31%, lines 87.39%); test:coverage exits 1.
    Attribution: pre-existing debt from slices 1–14 — slices 15 ("76%/77%, accepted as
                 pre-existing") and 16 ("~76–77%") shipped at this exact level. Slice-17 files
                 sit ABOVE the global average (feature 100% stmts/func/lines; components
                 92.2/78.72/90/95.83), so they can only raise the global, not lower it.
    Branch 76.05% is below the web-testing.md [78%,80%) band, but raising the whole project to
    floor is accumulated cross-slice debt, out of scope for slice 17 (surgical-change rule).
    Match key: unit-test/web::web-testing.md#coverage-floor
    Options: accept-as-pre-existing (slices 15/16 disposition) | defer | invest (separate task)
```

## Final status: UNRESOLVED — design-fidelity render not applicable + coverage-debt pending developer decision
Every runnable, in-scope phase is green (conformance PASS, 748/748 web, 432/433 API with the 1 pre-existing HealthTests fail, code review + security review clean). A **CLEAN cache is deliberately NOT written** — per the skill, a CLEAN verdict + its `evidence_manifest` may not be produced from a pass where the design-fidelity render did not run, and the coverage-debt finding is open pending the developer's decision. Handed to the developer for the ship decision — the established pattern in this repo (see slice-6/13/15/16 logs). No `.last-clean-run.json` written.
