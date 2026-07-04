# Design-fidelity findings — slice-similar-requests-activity-cd32a6a

Method: stood up the full stack (LocalDB `IntakeTrackerDev` — 32 migrations + 35 procs + seeded dev user/membership/2 requests; API on :5080 with the dev auth bypass; web dev server on :5173), smoke-tested the slice-6 endpoints live, then rendered the changed prototyped surfaces (system Edge via Playwright) and compared them against the prototype (`artifacts/docs/design/project/AI Solutions Tracker.dc.html`). Stack torn down after.

## Scope (audit only the prototyped surfaces this slice changed + serves)
This slice modifies two already-prototyped screens. Screens it does not touch were reviewed at their owning slices.

| Screen | App route | Verdict | Evidence |
|---|---|---|---|
| S3 Intake — similar-requests aside (empty) | `/requests/new` | **match** | `build-s3-intake.png` |
| S3 Intake — similar-requests aside (populated) | `/requests/new` (name typed) | **match** | `build-s3-similar-populated.png` |
| S4 Record detail — Activity tab | `/requests/AIS-00000001` → Activity | **match** (+1 documented addition) | `build-s4-activity.png`, `build-s4-activity-mention.png` |

## Comparison detail

**S3 similar-requests panel.** Empty state renders the prototype's exact copy — "Matches appear here as you type the name and description." Typing a name fires the live nudge; the populated match row reproduces the prototype's markup precisely: `AIS-00000002 · intake` (mono id + stage) with a dismiss ✕, the record name ("Contract clause finder"), and the `LINK AS RELATED` / `OPEN` actions (uppercase, letter-spaced, leading icons). No visual drift.

**S4 Activity tab.** The timeline reproduces the prototype's S8 Activity structure — icon rail + title/meta/detail: a "You commented" item with a chat icon (accent), a timestamp, and the body with the `@dev` mention emphasised in `--accent-interactive`. The record-detail chrome around it (breadcrumb, meta strip, continuous-track stepper, six-tab row) is slice-5's prototyped surface and still matches.

**Documented addition (added-element, blueprint-justified, non-drift).** The prototype's Activity tab is a **read-only timeline with no composer** (module-boundaries: "Activity content is out of scope in the prototype but the tab exists"). This slice adds the comment **composer** (label + textarea + live @mention preview + POST COMMENT) per **BS §9.3** (immutable comment posting). This is an intentional, spec-mandated addition beyond the prototype — recorded here explicitly rather than flagged as drift.

## Token / design-system conformance
`check-design-conformance.sh --web-required` → PASS (0 raw colours/radii, 128 files). All new component styles (`activity.css`, similar-panel styles in `intakeForm.css`) trace to design tokens; the mention emphasis + comment icon use `--accent-interactive`, the connector uses `--border-light`, pale pills use `--color-pale-blue`/navy per the theme-stable rule.

## Verdict
No blocking design-fidelity findings on the changed surfaces. The build faithfully reproduces the prototype's S3 similar-requests panel and S4 Activity timeline; the comment composer is the one documented, blueprint-justified addition.

> Note on formalism: this is a substantive build-vs-prototype render-and-compare of the surfaces this slice changed, with screenshot evidence. It does not produce the full machine-validated per-component `evidence_manifest` (hover/focus/active computed-style matrices for every DS component) that `verify-design-fidelity-manifest.mjs` checks — that apparatus is not constructed here.
