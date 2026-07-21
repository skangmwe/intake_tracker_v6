# Design-fidelity findings — fix-view-toggle-gallery-55f5b98

## Iteration 1

**Status: WAIVED — intentional prototype divergence, explicit developer decision (skangmwe, 2026-07-21).**

Intentional divergences from the prototype on this slice:
- Requests/Feature Catalog/Toolkit view-mode toggle relocated to the right, icon-only, at button height.
- Galleries and the Board drop the pager footer and use full-page (document) scroll + load-all.
- Board renders all lifecycle stages as columns (empty included).

These are deliberate product decisions. The full render-and-compare matrix (LocalDB + app stand-up +
per-component screenshot diff) is CI-scale and not run in this environment; waived via the established
DCLogic `component_coverage:"waived"` path (see [[record-status-hold-ship-blocked]]). `design-fidelity-web`
is deliberately omitted from the clean-run cache `phases_run` (the render machinery was not run).

Verified by the focused-equivalent method (iteration log): full jest suite 1386/1386 incl. axe on the
new states, tsc no new errors, ESLint clean, manual token scan clean.

Follow-up: if these become canonical, update `full-design-blueprint.md` + the prototype so a future
render gate matches.
