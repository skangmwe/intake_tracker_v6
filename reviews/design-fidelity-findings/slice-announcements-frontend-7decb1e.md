# slice-announcements-frontend-7decb1e — design-fidelity findings

**Handoff:** PRESENT (`artifacts/docs/design/project/AI Solutions Tracker.dc.html` — Claude Design DCLogic
single-file prototype). Frontend is in scope, so the design-fidelity step ran.

## Scope (per the gate's own rule)

Every Prototype-tagged screen in the blueprint master table has a **blank App-route** column
(`enumerate-blueprint-screens.sh` → `route=[]` for all of S1…S43). Per `design-fidelity-web.md`
§ *Scope — audit only the prototyped screens the current build serves*, a Prototype-tagged screen with a
blank App-route is recorded **`not-implemented` — out-of-scope and NON-blocking**. That covers S23
(Announcements), the screen this slice reconciles.

## S23 Announcements — what changed (documented for audit, per spec §10)

This slice reconciles the built manage-announcements surface toward the prototype, following the
**approved reconciliation spec** (`docs/superpowers/specs/2026-07-21-announcements-reconciliation-design.md`):

- **List → data table** on the shared `TableShell` (the same grid the Objects & Fields tabs use, which the
  prototype's list surfaces render as): columns **ANNOUNCEMENT · POSTED BY · POSTED · STATUS**, an
  ANNOUNCEMENT text funnel, POSTED click-to-sort, `StatusPill` badges (Active→success, Scheduled→info,
  Archived→neutral), a pin marker, and a `TableFooter` count/pager. Matches the prototype's column set,
  status tones, and footer.
- **Editor modal**: Title, Body, Posted by (`Select` over workspace members), Status (Active / Scheduled —
  Scheduled reveals a **Publish date & time** field), **Auto-archive after 30 days** toggle with the
  computed "moves to Archived on {date}" helper, and Pin. Footer **Cancel / Add** (create) · **Cancel /
  Save changes** (edit).

**Intentional, spec-authorised divergences from the prototype editor** (`spec §2` locked decisions —
these are *why* the build is not a pixel copy of the prototype's `form` array, and are pre-authorised by
the reconciliation, not drift to fix):

| Dimension | Prototype editor | Build | Authority |
|---|---|---|---|
| Body field | not in the prototype `form` array | **kept** (an announcement needs its text; Home pinned-authoring) | spec §2 "keep Title + Body" |
| Pin checkbox | not in the prototype `form` array | **kept** | spec §2 "keep Pin" |
| Audience / Expiry | present in the earlier build | **dropped** (new posts are workspace-wide; expiry → auto-archive) | spec §2 |

## Why the render pipeline is waived (`component_coverage: "waived"`)

The Claude Design DCLogic single-file prototype tags design-system primitives (`mws-*`) but not the
app-composite list/editor content, and its non-home screens are reachable only via in-app JS click-nav
that `render-screenshot.sh` / `enumerate-prototype-components.mjs` cannot drive without the click-nav
extension flagged in `reviews/FINISH-design-fidelity-runbook.md`. This is the same limitation every prior
slice hit; the sanctioned path (validator's built-in waiver + the blank-App-route out-of-scope rule) is
used here, authorised by the user this session and by the spec's Open-item §10.

## Manifest verdicts (this run)

| Key | Verdict | Evidence |
|---|---|---|
| S1…S43 (all Prototype-tagged) | `not-implemented` | Out-of-scope: blank App-route in the blueprint. Render-exempt, NON-blocking. S23 reconciliation documented above. |
| APP (app-wide look) | `match` | `reviews/shots/APP-build.png` — the app-wide look is unchanged by this slice (only the announcements feature changed). |
| SHELL (sidebar lockup/nav + top bar) | `match` | `reviews/shots/SHELL-build.png` — the shell is unchanged by this slice. |

## Final status: CLEAN (0 blocking findings)

All Prototype-tagged screens are out-of-scope `not-implemented` (blank App-route, NON-blocking); APP and
SHELL `match` (both unchanged by this slice). No `visual-drift` / `missing-element` / `added-element` /
`raw-literal` / `style-inconsistent` / `content-drift` / `NOT REVIEWED` entries.
