---
name: generate-sitemap
description: >-
  Renders a Screen Map as a polished, self-contained `sitemap.html` — color-coded boxes
  (blue = in prototype, grey = save for /build, gold = suggested) with optional orthogonal
  navigation arrows. Invoked by a parent skill that has a Screen Map (currently
  `/design-foundation`). Pure rendering — doesn't pick or score screens; if no Screen Map
  exists, decline and tell the parent to build one first. Writes to
  `artifacts/docs/design/sitemap.html` by default.
---

# generate-sitemap

Re-invoke whenever the Screen Map changes; overwriting the same output path is the expected pattern. The skill's job is data substitution into the template — **all layout, arrow routing, hover behavior, and the toggle live in the template's inline `<script>` block.** Open the output in any browser; it does the rest.

Current callers: `/design-foundation` (at the user checkpoint).

## Inputs

The caller provides:

1. **Product name** — string, used in title and H1.
2. **Screens** — list. Each has: `id` (e.g., "S1"), `name`, `role`, `tag` (Prototype/Save for /build), `source` (one of `requirement`, `inferred-infrastructure`, `inferred-feature`, `suggested-enhancement`), `connects-to` (list of (target_id, action_label) pairs; labels 2–3 words).
3. **Output path** — default `artifacts/docs/design/sitemap.html`. Create parent dir if missing.

If any input is missing or ambiguous, ask the caller — don't guess.

## Output

One self-contained HTML file at the specified path. Typical size: 20–40 KB. No `<script src>`, no `@import`, no `<link rel="stylesheet">`, no web fonts.

## Input → template data mapping

Translate the caller's screens into two arrays the template's inline JS consumes:

**SCREENS** — one entry per screen: `{ id, name, role, tier, orange }`.
- `tier`: `'prototype'` if `tag === 'Prototype'` else `'save-for-build'`.
- `orange`: `true` if `source ∈ { inferred-feature, suggested-enhancement }` else `false`. Set to `false` for prototype-tier screens.

**ARROWS** — one entry per (source, connects-to target) pair: `{ from: screen.id, to: target_id, label: action_label }`. Iterate every screen's `connects-to` list and flatten.

Screen `name` values are rendered in sentence case by the template (ALL-CAPS tokens like `API`/`SKU` are preserved), so casing of the input doesn't matter. Names also wrap to two lines inside the box; keep them short enough to read at ~18 chars/line.

Emit both as **JSON literals** (use `JSON.stringify`) so keys are quoted.

## Template substitution

Read `assets/sitemap-template.html` for the full scaffolding (CSS, header, legend, controls, container, inline JS). Substitute the placeholders below before writing.

| Token in template | Replace with |
|---|---|
| `[PRODUCT_NAME]` | **Replace including the brackets.** Product name string; two occurrences (`<title>` + `<h1>`). |
| `SCREENS_JSON` | **Bare token — leave the surrounding `[ ]` alone** (template owns them via `const SCREENS = [SCREENS_JSON];`). SCREENS as comma-separated JSON objects, no brackets. Replacing `[SCREENS_JSON]` *with* brackets eats the array literal → broken JS / blank page. |
| `ARROWS_JSON` | **Bare token — leave the surrounding `[ ]` alone** (`const ARROWS = [ARROWS_JSON];`). ARROWS as comma-separated JSON objects, no brackets. |

Do not modify the CSS, the legend, the controls, or any inline JS — those define the McDermott style and the runtime behavior documented below.

## Before returning — automated self-check (mandatory)

Run these three checks on the written file and fix any failure before returning. (`node --check` alone isn't enough: with exactly one screen, eaten brackets produce valid-but-wrong JS — the `const SCREENS = [` assertion is what actually catches that.)

```bash
f=artifacts/docs/design/sitemap.html
grep -Eq '\[PRODUCT_NAME\]|\[?SCREENS_JSON\]?|\[?ARROWS_JSON\]?' "$f" && echo "FAIL: placeholder left" || echo "ok: no placeholders"
grep -Eq 'const SCREENS = \[' "$f" && grep -Eq 'const ARROWS = \[' "$f" && echo "ok: array literals present" || echo "FAIL: array brackets eaten"
sed -n '/<script>/,/<\/script>/p' "$f" | sed '1d;$d' | node --check /dev/stdin && echo "ok: script parses"
```

## Runtime behavior — what the inline JS does

The template's inline JS owns layout, arrow routing, hover, and the toggle. Understand this when maintaining the template; the skill itself only injects data.

### Responsive layout

| Constant | Value | Role |
|---|---|---|
| `BOX_W`           | 140 | Box width |
| `BOX_BASE_H`      | 56  | Box height when arrows are on |
| `CONN_LINE_HEIGHT`| 8   | Per-connection line height when arrows are off |
| `GAP`             | 32  | Horizontal gap between boxes; vertical gap between sub-rows |
| `PAD_LR`          | 30  | Left/right outer padding |
| `PAD_TOP`         | 75  | Top padding (room for Tier 1 row label + arc-above arrows in sub-row 0) |
| `TIER_GAP`        | 72  | Vertical gap between tiers (room for Tier 2 row label) |
| `PAD_BOTTOM`      | 32  | Bottom padding |

**Column count from container width, recomputed every render:**

```
fits = floor((containerWidth - (2*PAD_LR - GAP)) / (BOX_W + GAP))
cols = clamp(fits, 3, 7)
```

The 3 floor protects split-screen widths; the 7 cap prevents single overly-wide rows. A `resize` listener (100ms debounce) re-renders the whole diagram.

Each tier fills left-to-right; when a sub-row hits `cols` boxes, the next starts a new sub-row in the same tier. Save-for-build entries sort so `orange=true` clusters at the tier's right. Per box: `col = i % cols`, `row = floor(i / cols)`, `x = PAD_LR + col*(BOX_W+GAP)`, `y = tier_y_start + row*(BOX_H+GAP)`. SVG `viewBox` is computed to fit exactly.

### Arrow routing — 4 orthogonal cases

For each `ARROWS` entry, the routing case is decided by source and target's sub-row + column. All four use right-angle paths (no diagonals across boxes). The `goingDown` flag (`src.tier < tgt.tier || (sameTier && src.row < tgt.row)`) decides case-4 entry direction.

| Case | When | Path | Label |
|---|---|---|---|
| **1. Adjacent same sub-row** | `sameSub && abs(colDiff) === 1` | Horizontal line at boxes' vertical midpoint, source right-edge → target left-edge (or mirrored). | Centered above line at `midY − 18`. |
| **2. Non-adjacent same sub-row, sub-row 0** | `sameSub && src.row === 0` | Cubic Bezier arc above the sub-row, peaking 65px above the box tops. The `PAD_TOP = 75` gives this room — that's why it's restricted to sub-row 0. | At arc apex; ±40px slack for collision resolution. |
| **3. Non-adjacent same sub-row, sub-row 1+** | `sameSub && src.row > 0` | U-over: up out of source, across inter-row channel at `src.y − GAP/2`, down into target. | Above the horizontal channel. |
| **4. Cross sub-row or cross-tier** | otherwise | Z-shape with side entry: vertical out of source, horizontal across inter-row channel, vertical at `target.x ± GAP/2`, horizontal into target's side edge. Same column → straight vertical. | Above the channel-running horizontal segment. |

### Render order and collision resolution

Render order: **arrow lines (bottom) → boxes (middle) → arrow labels (top)**. Arrow lines render behind boxes so any path that would otherwise draw through a card (a same-column cross-row arrow, for instance) is occluded by the card. Labels render in a separate `<g class="arrow-label-group">` appended last so they sit on top of both boxes and arrows. Label placement uses three passes:

1. **Compute** path data, initial label position, label width, and the allowed horizontal range (`segMinX`..`segMaxX` — the span of the arrow's horizontal segment the label can ride along).
2. **Resolve collisions** greedily: for each label, try shifts of `[0, ±30, ±60, ±90, ±120, ±150]` from its midpoint. First shift that stays inside `segMinX..segMaxX` AND doesn't overlap an earlier-placed label wins. If none qualifies, revert to midpoint.
3. **Build HTML** from resolved positions.

The segment constraint keeps labels visibly attached to their arrow even after a shift.

### Hover interactions

Wired via `data-from`/`data-to` on `g.arrow-group` and `g.arrow-label-group`, and `data-screen-id` on `g.card-group`. Default arrows are 1.5px at 28% navy with hidden labels. Each arrow has a sibling `path.arrow-hit` (`stroke-width=14`, `pointer-events=stroke`) for a comfortable hit target.

| Hover on | Effect |
|---|---|
| Arrow | Stroke → navy + 2.5px, marker → `#arrowhead-hover`; matching label group highlights (fades in). |
| Label | Matching arrow group highlights (label is already visible via own CSS `:hover`). |
| Card | Every arrow + label group where `data-from` or `data-to` matches the card's `data-screen-id` highlights. |

### Arrows-on / arrows-off toggle

A styled pill toggle (uppercase "SHOW FLOW ARROWS" label + sliding switch) flips `arrowsOn`. Default is **on** — arrows are the sitemap's defining feature; the toggle is the escape hatch when a map gets too busy.

When `arrowsOn === false`: no arrow groups emitted; each card's height grows to `BOX_BASE_H + maxConnections * CONN_LINE_HEIGHT + 6` and renders one `→ <targetId> · <label>` line per outgoing connection. Toggling re-runs `render()` end-to-end.

### Arrowhead markers

Two markers, both `markerUnits="userSpaceOnUse"` (fixed pixel size, doesn't scale with stroke):

- `#arrowhead` (9px, default) — `fill="context-stroke"` inherits the arrow's color.
- `#arrowhead-hover` (7px) — applied via `marker-end: url(#arrowhead-hover)` on hover/`.highlighted` arrow groups. Slightly smaller so the thicker hover stroke isn't top-heavy.

## Visual style

McDermott Design System. All tokens, colors, typography, and component styles are encoded in the template's CSS — see `.claude/rules/design/_core-requirements.md` for the full system.

## Quality bar — must hit before returning

1. **Self-check passed.** The three checks under "Before returning" pass — no raw placeholders, both `const SCREENS = [` / `const ARROWS = [` array literals intact, `node --check` clean (also covers malformed JSON and trailing commas).
2. **Opens and renders.** In a browser: boxes appear, row labels above each tier, arrows orthogonal, toggle and hover work. A blank page means eaten brackets — see the self-check.

Everything else (corners, fonts, role-label casing, labels-on-top, resize, no external dependencies) is fixed by the unmodified template and needs no per-run verification.
