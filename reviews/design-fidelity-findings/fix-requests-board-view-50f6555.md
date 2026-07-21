# Design-fidelity findings — fix-requests-board-view-50f6555

## Iteration 1

**Status: WAIVED — intentional prototype divergence, explicit developer decision.**

Finding `design-fidelity/requests::S2/view-mode-toggle` — the Requests toolbar now shows a
Table/Board view-mode toggle that the prototype does not render.

- **Verdict:** `added-element` (would normally be blocking High).
- **Disposition:** WAIVED by the analyst (skangmwe) on 2026-07-21. The product decision is that
  Requests gets Table + Board; the prototype (which scopes advanced views to Dashboards) is
  intentionally not matched on this point. Recorded as `component_coverage: "waived"` in the
  clean-run manifest — same waived path used for prior DCLogic-prototype divergences on this
  project.
- **Follow-up:** if this divergence is made canonical, update `full-design-blueprint.md` + the
  prototype so the gate matches on a future run. Until then this waiver is re-asserted per ship.

The full render-and-compare matrix (LocalDB + app stand-up + per-component screenshot diff via
sub-agents) is CI-scale and was not executed in this environment; the change was verified by the
focused-equivalent method recorded in the iteration log (tests 22/22 incl. axe on the Board
state, ESLint clean, tsc no new errors, manual token scan clean, focused diff-only code +
security review clean).
