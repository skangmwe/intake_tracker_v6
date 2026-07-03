# Design Fidelity — Web (render & compare against the prototype)

> **Single source of truth.** This file lives at `shared/design-fidelity-web.md`
> in the CLI source tree and is copied to BOTH role trees at scaffold time
> (`commands/create.js` copies it into either
> `.claude/skills/review/design-fidelity-web.md` for analyst projects or
> `.claude/skills/dev-review-and-remediate/design-fidelity-web.md` for dev
> projects). Edit only the source-tree version; the scaffolded copies are
> regenerated on every `nstar create`. There is no manual mirror to keep in sync.

This file is the spec the design-fidelity audit walks against. The audit is a
**visual-compliance check with one question**: does the built screen **look like
the prototype**? The prototype is the source of truth. For every prototyped
screen the audit **renders the prototype and the build side by side and compares
them**; any visual difference is a blocking finding that drives a fix loop until
the build matches. There is no element-contract and no intermediary artifact —
the reference is the rendered prototype itself.

It defines the comparison procedure, the render mechanism, the verdict
reference, the evidence schema, the manifest structure, and the output formats.
The orchestration (when to re-spawn a sub-agent, the adversarial brief) lives in
the review skill's SKILL.md and is summarized here.

---

## Source of truth — four sources

The build target is exact: **everything the prototype contains, built exactly as
it renders, plus every Save-for-/build screen the blueprint specifies.**

| # | Source | Path | Authority for the audit |
|---|---|---|---|
| 1 | **Prototype** | `artifacts/docs/design/project/` | **visual source of truth for the screens it renders** — the audit compares the build against it |
| 2 | **Blueprint** | `artifacts/docs/design/full-design-blueprint.md` | which screens exist (Prototype vs Save-for-/build), structure, and the content of Save-for-/build screens |
| 3 | **Requirements** | `artifacts/docs/product/solution-requirements.md` | intent (reference only) |
| 4 | **Design rules** | `.claude/rules/design/` | token vocabulary + fallback for what the prototype doesn't specify |

**Prototyped screen → the prototype is the spec.** The build must reproduce it:
layout, spacing, type, color, component variants, states. A prototyped screen
that doesn't look like its prototype is a defect.

**Save-for-/build screen → no prototype to compare against.** It's built from the
blueprint (content) and styled to match the prototype's established patterns. The
audit judges visual *consistency* with the prototyped screens + content against
the blueprint.

**The prototype is a genuinely external reference.** It was produced by the user
in Claude Design, not by the build model — so comparing build-vs-prototype is a
real independence check, not the build model grading its own work. (The sub-agent
isolation below still applies, but the reference itself is external.)

---

## What the audit checks

### Prototyped screens — render & compare

For every Prototype-tagged screen, pair it to its prototype file (the blueprint's
**Prototype source** column) and its built route (the **App route / component**
column), then:

1. **Render the prototype** focal `.html` headless → screenshot + capture key
   computed styles.
2. **Render the build** at the paired route, populated with **reviewer-generated
   mock data**, at the matched viewport and the state the prototype shows →
   screenshot + capture the same computed styles.
3. **Compare**, per dimension:
   - **Element presence** — every element the prototype renders on that screen
     must appear in the build (`missing-element`); nothing extra that the
     prototype doesn't show (`added-element`).
   - **Visual form (default state)** — layout, spacing rhythm, type scale, color,
     component variant, radius, empty/error states. A difference is `visual-drift`,
     named to the property with the prototype value vs the build value (e.g. *card
     padding 24px → 16px*; *button filled-navy → outlined-blue*).
   - **Interaction states** — for each interactive element (nav links, buttons,
     text links, tabs, inputs/selects, toggles, interactive cards), force
     `:hover` / `:focus-visible` / `:active` on **both** sides (via
     `render-states.mjs`) and compare. A difference in any forced state — a hover
     colour, a focus ring, an active/selected treatment — is a blocking
     `visual-drift`, **same severity as default-state drift**, named with the
     state (e.g. *nav-link hover #00E2C1 → #0018F2*; *primary-button focus-ring
     present → missing*).
   - **Whole screen missing** — no built route renders the screen →
     `not-implemented`.

Findings must be **concrete enough to fix**: name the element/dimension, the
prototype value, and the build value — never "looks off."

### Save-for-/build screens — consistency + content

No prototype to compare against. Render the built screen and check:
- **Visual consistency** with the prototyped screens — same components, spacing,
  type scale, color usage, nav/interaction patterns. A drift from the established
  look is `style-inconsistent`.
- **Content** against the blueprint's per-screen spec (purpose, content, role,
  connections). A divergence is `content-drift`.

### The deterministic floor — `check-design-conformance.sh`

Tokens-only / no-raw-literals is enforced separately by
`check-design-conformance.sh` (a blocking gate in the review's test step) and is
what guarantees the prototype's exact values are preserved through the token
override layer rather than snapped or inlined. A value inlined as a raw literal
instead of a `var(--…)` token is `raw-literal`. This audit does not re-derive
that; it relies on the hook for the code-level half and renders for the visual
half.

### Hard precondition — the prototype must be present

When `detect-design-handoff.sh` prints PRESENT, the prototype bundle must exist
at `artifacts/docs/design/project/`. If it's absent, the audit cannot run — a
**High blocking** finding (`design-fidelity-web.md#no-prototype`): surface it,
abort the cache write, set status OPEN. Do not fall back to auditing against the
blueprint's prose; the visual comparison needs the rendered prototype.

---

## The render mechanism (a hook does the capture — don't improvise browser flags)

The review captures every screenshot through the **`render-screenshot.sh` hook**,
not ad-hoc browser invocations. The hook encapsulates the finicky recipe (fresh
`--user-data-dir` per call — the default profile is locked and fails without it;
the new headless mode; a virtual-time budget so an SPA settles), auto-detects
Chrome or Edge across platforms, and exits non-zero with a clear reason if no
browser is found or the PNG isn't produced. (The built-in `preview_screenshot`
MCP tool is unreliable — it times out — so it is **not** used.)

```bash
# capture one screen (prototype or build), 1280×800 viewport by default:
bash .claude/hooks/render-screenshot.sh "<url-or-file://path>" "<out.png>" [width] [height]
# → "RENDER: OK <out.png> (1280x800)" and exit 0, or a RENDER: ERROR + exit 1.
```

**Both sides are served over http for the comparison.** The build is up via the
`/local-testing` skill (data store + API + web on a known port); the prototype
bundle is served by a small static server. Both render hooks then take an `http(s)://`
URL — the interaction-state hook (below) drives the browser over CDP and is
http-based, so serving the prototype over http (rather than `file://`) is the
contract that keeps both sides on one path.

Per screen, three channels — used together:

- **Default-state screenshot (holistic "does it look like the prototype").** Call
  `render-screenshot.sh` twice — once for the prototype URL, once for the paired
  build route — at the same viewport. Open both PNGs and compare layout/form.
- **Interaction-state capture (`:hover` / `:focus-visible` / `:active`).** Static
  screenshots only capture the default paint, so hover/focus/active drift slips
  through. The **`render-states.mjs` hook** drives a real headless browser over
  the Chrome DevTools Protocol and uses `CSS.forcePseudoState` to **deterministically
  force** a state on a selected element before capturing (more reliable than
  synthesizing pointer events; the element clip is padded so a focus ring rendered
  outside the box is captured). No dependency — it speaks CDP over Node's built-in
  WebSocket. Capture the **same forced state on both sides** (prototype + build)
  and compare.
  ```bash
  node .claude/hooks/render-states.mjs --url "<http-url>" --out "<png>" \
       --selector "<css>" --state hover|focus-visible|active|default [--width W] [--height H]
  # → "RENDER-STATE: OK <png> (<state>)" exit 0, or "RENDER-STATE: ERROR <reason>" exit 1.
  # Batch (preferred per component — all states in ONE browser launch):
  node .claude/hooks/render-states.mjs --url "<http-url>" --selector "<css>" \
       --states hover,focus-visible,active --out-dir "<dir>"
  # → writes <dir>/<state>.png + a "COMPUTED <state>: <json>" line per state.
  ```
  **Which components + states — enumerated deterministically, never eyeballed.**
  Do NOT compare whole screens by glance. For each prototyped screen, run the
  **component enumerator** on BOTH the prototype URL and the built route:
  ```bash
  node .claude/hooks/enumerate-prototype-components.mjs --url "<http-url>" [--width W] [--height H]
  # → "COMPONENTS: <n>" then a "COMPONENT\t<type>\t<ordinal>\t<selector>" row each,
  #   then "UNKNOWN-INTERACTIVE\t<selector>" for any interactive element matching no
  #   known design-system type. exit 1 + "COMPONENTS: ERROR …" on failure (blocking).
  ```
  It classifies design-system components by the prototype's MWS classes and by the
  build's mandated `data-ds="<type>"` attribute (see `web-styling.md`), so the two
  sides match by **(type, ordinal)** — never by selector (CSS-Module class names
  are hashed). **Every component the enumerator finds on a screen MUST get its own
  comparison record** — the manifest validator FAILs if one is missing, so a
  component that was never individually diffed cannot pass. Any
  `UNKNOWN-INTERACTIVE` row is a blocking signal (an element the design system
  doesn't recognize — add `data-ds`, or surface it), never silently ignored.

  For each matched component capture, at minimum, `hover` and `focus-visible` (and
  `active` wherever the prototype defines a distinct active/selected style — set
  `requires_active` on the record), forcing the SAME state on both sides via
  `render-states.mjs`. **The prototype's own design-system CSS is the source of
  truth for each state** — its `:hover` / `:focus-visible` / `.active` /
  `[aria-selected]` / `[aria-current]` rules define what the build must match.
- **Computed-style diff (REQUIRED per component — catches geometry a screenshot
  misses).** `render-states.mjs` also emits a `COMPUTED: <json>` line: a curated
  property set (display, flex-grow/shrink/basis, width, height, justify/align,
  gap, padding, margin, font, color, radius, border) for the targeted component.
  Record BOTH sides' reads as `prototype_computed` + `build_computed` on the
  component record; the validator diffs them deterministically — **px lengths
  within ±1px, everything else exact — and blocks a `match` that carries any
  out-of-tolerance delta.** This is what catches a stepper that is `flex:1`
  evenly-distributed in the prototype but packed-left (`flex-grow:0`) in the
  build — drift a downscaled PNG comparison sails past.

**Hard-block on render failure.** If `render-screenshot.sh` or `render-states.mjs`
exits non-zero for any in-scope screen or state (no Chrome/Edge on the machine, the
dev server isn't serving the route, or a capture times out — the state hook fails
closed after a bound rather than hanging), the design-fidelity step is a **blocking
failure** (`design-fidelity-web.md#render-failed`): abort the cache write, set status
OPEN. The gate cannot certify what it could not render — it never skips to a pass.

**Mock data is the reviewer's job.** The reviewer generates plausible mock data
(shaped like the prototype's content) purely to populate the screens so they
render. The audit never compares data values — only visual form. Routes behind
auth/data must be reachable in the running build (mock auth/seed as needed).

---

## Verdict reference

| Verdict | Meaning | Severity |
|---|---|---|
| `match` | The built screen reproduces the prototype (or, for Save-for-/build, is consistent with the prototype + matches the blueprint). | — |
| `visual-drift` | Prototyped screen — an element is present in both but differs (layout/spacing/type/color/variant/radius/state). Named with prototype value vs build value. | **High blocking** |
| `missing-element` | Prototyped screen — the prototype renders an element the build doesn't. | **High blocking** |
| `added-element` | Prototyped screen — the build renders an element/affordance the prototype doesn't show. | **High blocking** |
| `not-implemented` | A Prototype-tagged screen has no built route, or a Save-for-/build screen wasn't built and isn't declared out-of-scope. | **High blocking** |
| `raw-literal` | A value is inlined as a raw literal instead of a `var(--…)` token (cross-checked with `check-design-conformance.sh`). | **High blocking** |
| `style-inconsistent` | Save-for-/build screen — drifts from the prototype's established visual patterns. | **High blocking** |
| `content-drift` | Save-for-/build screen — content diverges from the blueprint's spec. | **High blocking** |
| `NOT REVIEWED` | A screen claimed compared without both renders captured, or a row missing its required evidence refs. | **High blocking** |

`added-element` / `missing-element` are first-class here: because the prototype
is the per-screen spec and the build must match it exactly, both directions of
divergence are findings. (This is the deliberate reversal of the old
contract-based model, where reconciliation was baked in upstream.)

### Severity → fix-class mapping

| Verdict | Fix class | Remediation |
|---|---|---|
| `visual-drift` | Mechanical (or Architectural if it needs layout rework) | Change the build's value to the prototype's, routed through a token/override variable; re-render and re-compare |
| `missing-element` | Mechanical if the element is straightforward; else Architectural | Add the element as the prototype renders it |
| `added-element` | Mechanical | Remove the affordance the prototype doesn't show |
| `not-implemented` | Architectural | Build the screen (from prototype for Prototype-tagged; from blueprint for Save-for-/build) |
| `raw-literal` | Mechanical | Replace the literal with `var(--…)`; define the variable in the override layer |
| `style-inconsistent` | Mechanical/Architectural | Re-style to the prototype's patterns |
| `content-drift` | Mechanical | Align content to the blueprint spec |

The loop is **render → compare → fix → re-render → re-compare** until a screen is
`match`.

---

## Evidence schema

Each Prototype-tagged screen contributes a comparison record proving it was
actually rendered on both sides, plus a discrepancy list:

| Field | Meaning | Required? |
|---|---|---|
| `screen` | screen ID from `enumerate-blueprint-screens.sh` | always |
| `prototype_source` | the prototype file compared against (blueprint's Prototype-source column) | Prototype-tagged screens |
| `app_route` | the built route rendered (blueprint's App-route column) | always (unless `not-implemented`) |
| `prototype_shot` | path to the prototype default-state screenshot captured | Prototype-tagged (unless `not-implemented`) |
| `build_shot` | path to the build default-state screenshot captured | always (unless `not-implemented`) |
| `verdict` | per-screen roll-up: `match` or the worst component/discrepancy verdict | always |
| `discrepancies` | array of `{ dimension, prototype_value, build_value, verdict }` | required when verdict ≠ `match` |
| `enumerated_components` | array of `{ type, ordinal }` — the `enumerate-prototype-components.mjs` ground-truth set for this screen | **Prototype-tagged (unless `not-implemented`)** |
| `components` | array of per-component records (next table) — **one per enumerated component** | **Prototype-tagged (unless `not-implemented`)** |

Each entry in `components[]`:

| Field | Meaning | Required? |
|---|---|---|
| `type`, `ordinal` | the component's enumeration key (matches an `enumerated_components` entry) | always |
| `prototype_selector`, `build_selector` | the per-page selectors used to target each side | always (unless component `not-implemented`) |
| `verdict` | `match` / `visual-drift` / `missing-element` / `added-element` / `style-inconsistent` / `not-implemented` / `NOT REVIEWED` | always |
| `state_shots` | `{ state, selector, shot }[]` from `render-states.mjs` — must cover `hover` + `focus-visible` (+ `active` when `requires_active`) | component rendered |
| `requires_active` | true when the prototype defines a distinct `:active`/selected style | when applicable |
| `prototype_computed`, `build_computed` | the two `COMPUTED:` reads `render-states.mjs` returns — the validator diffs them (±1px / exact) | component rendered |

A screen claimed `match` without both `prototype_shot` and `build_shot` is
`NOT REVIEWED`. **A prototype screen with no `enumerated_components`, or whose
`components[]` omits a component the enumerator found, FAILs — whole-screen
eyeballing cannot substitute for a per-component diff.** A component `match`
without its `hover` + `focus-visible` captures (or `active` when
`requires_active`), or without `prototype_computed`/`build_computed`, or whose
recorded computed styles differ beyond tolerance, FAILs. A `discrepancies` entry
must name the dimension and both values. The field requirements are exported as
`EVIDENCE_REQUIREMENTS` + `COMPONENT_REQUIRED_STATES` + `COMPONENT_VERDICTS` from
`hooks/verify-design-fidelity-manifest.mjs` and consumed by the validator + its
tests — single source of truth (the tables above document it).

Save-for-/build screens carry `app_route`, `build_shot`, a `verdict`
(`match` / `style-inconsistent` / `content-drift` / `not-implemented`), and a
blank `prototype_source` / `prototype_shot`.

---

## Manifest structure — enumeration keys

The evidence manifest is keyed by **every screen the enumerate hook prints** —
both Prototype-tagged (compared against the prototype) and Save-for-/build
(consistency + content). `APP` and `SHELL` are also keyed: `APP` for app-wide
visual checks (type scale, spacing density, motion, focus ring) compared against
the prototype's overall look, `SHELL` for the persistent frame (sidebar lockup +
nav, top bar) compared against the prototype's chrome.

Each key carries its comparison record. The validator pins `blueprint_hash` and
**`prototype_bundle_hash`** (the hash of the prototype bundle the build was
compared against) so a mid-loop edit to the blueprint or a re-export of the
prototype invalidates stale evidence.

---

## Adversarial brief template (the sub-agent's job description)

The review skill spawns a fresh sub-agent for this audit and passes the brief
below. Substitute `$WT` and the project paths. The phrasing is calibrated for
adversarial framing and evidence-or-`NOT REVIEWED`. Change carefully.

> You are an adversarial design-fidelity reviewer. Your job is to find every way
> the built screens **fail to look like the prototype**. The prototype is the
> visual source of truth. Assume every screen is wrong until you have rendered
> both sides and compared them.
>
> Inputs:
> - Prototype (visual source of truth): `$WT/artifacts/docs/design/project/`
> - Built app: `$WT/web/` (start the dev server; populate with mock data you generate)
> - Blueprint (screen list + Prototype-source / App-route columns + Save-for-/build specs): `$WT/artifacts/docs/design/full-design-blueprint.md`
> - Token override layer: `$WT/web/src/mws/tokens.css`
> - Screen enumerate hook: `bash $WT/.claude/hooks/enumerate-blueprint-screens.sh $WT`
> - Component enumerate hook: `node $WT/.claude/hooks/enumerate-prototype-components.mjs --url <http-url>`
>
> Procedure (do every step; do not skip):
>
> 1. **Confirm the prototype exists.** If `artifacts/docs/design/project/` is
>    absent, STOP and report `no-prototype`.
> 2. **Run the screen enumerate hook.** Record each screen, its tag, its
>    Prototype-source file, and its App-route.
> 3. **For each Prototype-tagged screen:**
>    a. Render the prototype URL and the built route (mock data, matched viewport)
>       with `bash $WT/.claude/hooks/render-screenshot.sh <http-url> <out.png> [w] [h]`
>       on each side — the holistic default-state shot (`prototype_shot` / `build_shot`).
>    b. **Enumerate components on BOTH sides** with the component enumerate hook.
>       Match prototype↔build by **(type, ordinal)**. Record the prototype side as
>       `enumerated_components`. **Every enumerated component MUST get a record in
>       `components[]`** — you may not skip one. Any `UNKNOWN-INTERACTIVE` row is a
>       blocking finding (an element with no recognized design-system type).
>    c. **For each matched component**, run
>       `node $WT/.claude/hooks/render-states.mjs --url <http-url> --out <png> --selector <css> --state hover|focus-visible|active`
>       on **both** sides (the call also returns a `COMPUTED:` style read — record
>       both sides as `prototype_computed` / `build_computed`). Capture `hover` +
>       `focus-visible` (+ `active` where the prototype defines a distinct active
>       style; set `requires_active`). Compare the state screenshots; the validator
>       diffs the computed styles (±1px / exact) and blocks a `match` with any
>       delta. Record the component verdict + `state_shots` + the computed reads.
>    If any hook exits non-zero for an in-scope screen/component, STOP and report
>    `render-failed` (the gate cannot certify what it can't render). Roll the
>    component verdicts up into the screen verdict (a screen is `match` only if
>    every component matched), plus any screen-level `discrepancies`.
> 4. **For each Save-for-/build screen:** render the built route and judge visual
>    consistency with the prototyped screens + content against the blueprint.
> 5. **`APP` and `SHELL`:** compare app-wide look and the persistent frame against
>    the prototype.
>
> Output ONLY the evidence tables (Screen Coverage Matrix + per-screen comparison
> records + `APP` + `SHELL`) plus the coverage disclosure block (`checked` /
> `not_checked` / `least_confident`). No narrative. A screen claimed `match`
> without both screenshots captured is `NOT REVIEWED`; the orchestrator will
> reject it and re-spawn (fresh sub-agent) — it will NOT self-walk the gap.

### Banned reasoning (do not produce a `match` verdict on any of these)

Each is an automatic disqualifier — a screen that depends on one is `NOT REVIEWED`:

- *"Built via the handoff, probably faithful."*
- *"The build skill claimed to follow the prototype."*
- *"The component name matches, so it probably looks right."*
- *"I read the prototype's HTML; the classes look the same."* (Class names are not
  what paints — render it.)
- *"I rendered the build; it looks fine on its own."* (Compare it to the
  **prototype**, not to your expectation.)

A `match` requires both sides rendered and compared, with the screenshot paths
recorded.

---

## Output 1 — Screen Coverage Matrix

One row per screen the enumerate hook prints, plus `APP` and `SHELL`.

```markdown
## Screen Coverage Matrix

| Screen ID | Name | Tag | App route | Status | Notes |
|-----------|------|-----|-----------|--------|-------|
| S1 | Dashboard | Prototype | /dashboard | ✓ Match | rendered both; no drift |
| S2 | Detail | Prototype | /detail/:id | ⚠ Drift | card padding 24→16; button filled→outlined |
| S3 | Settings | Save-for-/build | /settings | ✓ Match | consistent with prototype; content per blueprint |
| S4 | Admin Panel | Save-for-/build | — | ✗ Missing | not built; not declared out-of-scope |
| APP | — | — | — | ✓ Match | type scale + spacing consistent with prototype |
| SHELL | — | — | — | ✓ Match | sidebar lockup + nav match the prototype chrome |
```

### Status values

| Status | Meaning | Severity (Prototype) | Severity (Save-for-/build) |
|---|---|---|---|
| `✓ Match` | Rendered and compared; build matches the prototype (or, Save-for-/build, consistent + content-correct) | — | — |
| `⚠ Drift` | Rendered; has open visual discrepancies | **High blocking** | **High blocking** |
| `✗ Missing` | No built route, and not declared out-of-scope | **High blocking** | **High blocking** |
| `§ Out-of-scope (plan §<n>)` | Save-for-/build screen explicitly declared out-of-scope in the plan | — | — |

---

## Output 2 — Per-Screen Comparison Record

For **every** Prototype-tagged screen, plus `APP` and `SHELL`, record the renders
and the discrepancies.

```markdown
### S2 — Detail
Prototype source: project/Detail.html   App route: /detail/:id
Prototype shot: artifacts/docs/dev/reviews/shots/S2-proto.png
Build shot:     artifacts/docs/dev/reviews/shots/S2-build.png
Enumerated components (prototype, ground truth): stepper#1, btn#1, btn#2, card#1, nav#1

Per-component records — every enumerated component gets one:
| type#ord | verdict | state_shots (proto/build) | computed delta (validator-diffed) |
|----------|---------|---------------------------|-----------------------------------|
| stepper#1 | visual-drift | hover,focus ✓/✓ | flex-grow 1→0; width 200px→120px (packed-left) |
| btn#1 | visual-drift | hover,focus,active ✓/✓ (requires_active) | background rgb(0,0,66)→rgb(0,24,242) |
| btn#2 | match | hover,focus ✓/✓ | — |
| card#1 | visual-drift | hover,focus ✓/✓ | padding-top 24px→16px; border-top-left-radius 2px→8px |
| nav#1 | visual-drift | hover,focus,active ✓/✓ (requires_active) | active color rgb(0,226,193)→rgb(0,24,242) |

Screen-level discrepancies (added/missing elements not tied to one component):
| dimension | prototype_value | build_value | verdict |
|-----------|-----------------|-------------|---------|
| "export" button | (not shown) | present | added-element |
```

The per-component computed deltas above are recorded by the reviewer as
`prototype_computed` / `build_computed` on each component; the **validator**
re-derives the deltas and blocks any that a `match` verdict tried to hide.

---

## Recording findings

Findings are appended to
`artifacts/docs/dev/reviews/design-fidelity-findings/<label>.md` under heading
`## Iteration <N>`. Match-key format for the architectural ledger:

```
design-fidelity/<app-route>::<screen-id>/<dimension>
```

Example: `design-fidelity//detail/:id::S2/card-padding`. Findings carry forward
across iterations the same way code-review and security findings do.

---

## Design rationale — why a review-side gate (and its known limits)

A **detection backstop at review time**, not a prevention constraint at build
time. Recorded so a future maintainer doesn't mistake it for an oversight:

- **The deeper fix is in `/build`.** The drift this gate catches is *produced* by
  `/build` / `/dev-build-application`, which is instructed to reproduce the
  prototype exactly. This gate is the backstop that verifies it happened by
  actually rendering both sides.
- **What this gate is good at (deterministic, code-enforced).** Forcing
  enumeration (every screen the enumerate hook prints gets a comparison record;
  the manifest is machine-validated for coverage), requiring both screenshots be
  captured before a `match` counts, pinning the audit to the blueprint **and**
  prototype-bundle content hashes so a mid-loop edit invalidates stale evidence,
  and the tokens-only floor from `check-design-conformance.sh`.
- **What this gate cannot do.** The *correctness* of each visual verdict (does the
  build really match the prototype) is LLM judgement over the rendered screenshots
  + computed styles. Sub-agent isolation reduces same-model bias, and the
  reference is genuinely external (the user's prototype), but the validator checks
  evidence *shape* (both renders captured, hashes pinned), not visual *truth*.
  This gate raises the floor; it does not guarantee a ceiling.

If you extend this: prefer moving checks that *can* be made deterministic into the
validator (`hooks/verify-design-fidelity-manifest.mjs`) — e.g. asserting both
screenshot files exist and are non-empty, asserting the App-route column is
populated for every Prototype-tagged screen — over adding prose to the SKILL.md.
The direction of travel is prose → validator.
