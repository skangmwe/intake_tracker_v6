# Design fidelity — fix-platform-nav-order-c5f8860

## Iteration 1

Waived manifest (reused). `MANIFEST: VALID`.

The Claude Design prototype for this project is a DCLogic single-file render that cannot produce a
per-component computed-diff manifest (`enumerate-prototype-components.mjs` yields 0 app components;
`render-states.mjs` cannot click-navigate the no-deep-link SPA). The established project pattern is
the validator's render-exempt waiver: every prototyped screen carries `verdict: "not-implemented"`
(blank App-route, render-exempt) and `APP` + `SHELL` carry `match` verdicts backed by committed
shots.

Reuse is honest for this change: the diff is limited to `web/src/App.tsx` (a route-redirect string)
and `web/src/features/platform-admin/platformNav.ts` (nav data). It touches **no** prototyped screen,
**no** application shell, **no** `web/src/mws` design token, and **no** `artifacts/docs/design/**`
artifact — so `blueprint_hash` and `prototype_bundle_hash` are unchanged from the template cache
(`ba9d5558…` / `24df58c0…`). Validated with
`node .claude/hooks/verify-design-fidelity-manifest.mjs . reviews/.last-clean-run.json` → `MANIFEST: VALID`.
