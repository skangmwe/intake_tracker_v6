# slice-home-surface-33f06db — design-fidelity findings

**Method:** stood up the built app live (webpack dev server `:5173` + a deterministic stub API `:5080`
mirroring the prototype's S1 mock data + the app's DEV auth bypass — no cloud, no real tenant) and
headless-rendered the built **S1 Home** route, then compared it against the prototype's S1
(`project/AI Solutions Tracker.dc.html` — Home screen, read line-by-line). Stack torn down after; ports
freed; stub + throwaway build output removed (nothing committed).

## Iteration 1

### Screens compared (built by slice 22)

| Screen | Route | Verdict | Notes |
|---|---|---|---|
| **S1 Home** | `/` | **match** | Heading "Home" (Georgia) + accent **push-pin** Pin-as-home button; pale-blue **pinned-announcement strip** (push-pin icon + title + snippet + "Announcement history" link); four panels each as an `mws-card` with a navy-tinted header + monospace count: **Needs your decision** ("2 open"; rows = mono id · name · "Gate · From → To — your slot · Role" · "Waiting Nd" · caret), **Your work today** ("4 assigned"; due badges render **Overdue** pale-orange, **Due today** pale-gold, and plain "Due Jul 8/15"), **Since you were last here** ("Since <date>"; icon + "**Actor** event id — name" + relative time), **New to triage** ("3 unassigned"; origin · received · **Unassigned** pale-blue pill). Renders faithfully to the prototype. |
| SHELL | app frame | **match** | Navy sidebar lockup ("AI Solutions Tracker") + workspace switcher ("AI Solutions · hub") + grouped nav (Workspace / Reference / Admin) + collapse rail; top bar workspace search + bell (badge) + theme toggle + avatar — same as the prototype shell. |

### Live-render bugs caught

None on S1 itself — the built Home rendered faithfully on first render. (The tests, not the render, caught
this slice's real bugs: the `homeView.ts`/`HomeView.tsx` case-collision that would have broken the webpack
build, an eager audit-barrel import, and stale/incorrect test assertions — all fixed; see
`remediations-applied/`.)

Minor, non-blocking: the "Since you were last here" header shows the seeded `sinceLastSeenAt`
(`2026-07-01T00:00:00Z`) as "Since Tue, Jun 30" under the render host's local timezone (UTC-midnight →
prior local day). This is a display-timezone property of a "since ~date" indicator on a seeded value, not a
structural defect; the prototype's value was a hardcoded mock. No fix taken.

### Mechanical evidence manifest — blocked (documented limitation)

The full mechanically-validated manifest (per-component computed-style + hover/focus/active captures of
**both** the prototype and the build for a pixel diff) could not be produced: the Claude Design `.dc.html`
prototype does not switch to its S1 screen under an external headless-browser driver (same limitation
recorded in the slice-31 gate cache — the runtime only responds to real in-page gestures, so the prototype's
S1 cannot be screenshotted headlessly for a side-by-side pixel diff). CI uses the same headless approach and
would hit the same limitation.

## Result — OVERRIDE-AUTHORIZED

The built S1 was verified faithful by every available means: a **live headless render of the built screen**
(reviewed against the prototype's S1 DOM), the app **shell** match, **design-conformance** PASS (all
colours/radii trace to tokens), the **production webpack build** succeeds, and **jsdom full-composition
render tests** across every state (loading / no-workspace / error / populated / all-empty) pass with
jest-axe clean. The only unmet item is the mechanical manifest artifact, blocked by the `.dc.html`/headless
limitation — not by any build defect. Developer (session) authorized shipping on this documented method,
consistent with prior prototyped slices (S31 etc.), rather than stalling a complete, verified slice on a
tooling gap.
