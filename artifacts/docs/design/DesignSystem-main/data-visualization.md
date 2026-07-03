---
name: McDermott Data Visualization
description: 'Use when designing charts, graphs, dashboards, data tables, KPIs, metrics displays, sparklines, gauges, or any visual representation of quantitative or categorical data.'
version: 1.0.0
---
# McDermott Data Visualization
Charts and tables built from McDermott tokens. Theme-stable foreground rule applies: navy text on pale fills.

## Chart-type selection
| Question | Chart |
|---|---|
| How does a value change over time? | Line (or area for cumulative) |
| How do categories compare? | Horizontal bar (vertical only when labels are short) |
| Share of a whole? | Stacked bar or donut (≤5 slices) — never pie |
| How do two variables relate? | Scatter |
| What's the distribution? | Histogram or box plot |
| Trend at a glance, no axes | Sparkline |
| Single metric vs target | Bullet chart (gauge sparingly) |

More than 5 categories competing for attention → split, filter, or rank-and-truncate.

## Color
- **Categorical** (unordered): distinct hues from `--color-blue`, `--color-magenta`, `--color-orange`, `--color-gold`, `--color-teal`. Max 6 series.
- **Sequential** (ordered, single hue): tints of `--color-blue`, or `--color-pale-blue` → `--color-navy`.
- **Diverging** (positive/negative): `--color-error` → neutral → `--color-success`. Reserve for genuine bipolar data.
- **Highlight one series:** use `--color-teal` for focal; mute others to `--color-navy-gray-3`.

All palettes must pass colorblind simulation (Deuteranopia, Protanopia, Tritanopia).

## Axes, gridlines, legends
Y-axis starts at zero unless explicitly justified. Horizontal gridlines only (1px `--border-light`), no vertical unless time-based. Tick labels: Sans 12pt `--text-secondary`, locale-aware formatting. Axis titles only when units aren't obvious — sentence case. Legend near the data; for ≤4 series, label directly on the chart.

## Tooltips
Appear on hover and focus (keyboard accessible). Show series name + exact value + optional delta. Position so the tooltip never covers the data point. Use `--bg-surface`, `--shadow-md`, 1px `--border-light`, 2px radius.

# Tables (the workhorse)

## Structure
Semantic `<table>` with `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>`. `<th scope="col">` on column headers. Right-align numbers, left-align text, center icons-only / status badges. Body cells use `--font-sans`; numbers in `ui-monospace`. **Never set table data in the serif `--font-mix` (Georgia)** — serif slows scanning and column comparison. Header row: Sans 12pt 600-weight, ALL CAPS, 5% tracking, `--text-secondary`. Row separators: 1px `--border-light`. **No vertical rules** — they fragment the row. Empty cells: em-dash (`—`), never blank.

## Sorting
Click header to cycle ascending → descending → cleared. Active sort: `caret-up`/`caret-down` in `--accent-interactive`. Inactive sortable columns show a faint indicator on hover. Set `aria-sort="ascending|descending|none"`. Don't make every column sortable — only meaningful ones.

## Filtering
- **Global search** above the table, free-text across visible columns.
- **Per-column filter** for categorical columns: `funnel` icon in header opens checkbox popover; active filter shows a `--accent-interactive` dot.
- **Active filter chips** below the toolbar; each chip = label + `x`. "Clear all" link when 2+ active.

## Row selection & bulk actions
Leftmost column: per-row + select-all checkboxes. When ≥1 selected, the table toolbar **transforms** into a bulk-actions bar — left shows "X selected" + "Clear", right shows bulk actions. Selected rows: `aria-selected="true"` + subtle pale-blue tint. If selection persists across pages, surface "X selected across N pages" — or warn that changing pages clears it. `role="toolbar"` + `aria-label="Bulk actions"` on the bar.

## Row actions
Rightmost column: `dots-three-vertical` opens a popover (View, Edit, Duplicate, Delete-at-bottom). Visible on hover (desktop), persistent on touch. Destructive actions require a confirmation modal — a centered dialog over a scrim, primary button = the destructive action, Cancel = secondary. `aria-haspopup="menu"` + `aria-expanded`.

## Row detail — open the full record in a side sheet
A table should show the columns people scan and compare, not every field. When a row carries more than fits comfortably (long text, many secondary fields, nested data), keep the table to the scannable columns and move the rest into a **side sheet** (a non-blocking panel that slides in from the right — full spec in the Sheet bullet below), opened per row.
- **Trigger — row click.** Clicking a row opens its detail sheet, except on the interactive cells (selection checkbox, inline links, the row-action menu). `View` in the row-action menu opens the same sheet. Row click does **not** select — selection stays on the leftmost checkbox column (see Row selection & bulk actions). Rows get `cursor: pointer`; the **accessible** trigger is a dedicated per-row **View** button (an arrow/caret icon in the last cell, shown on row hover/focus) — see A11y.
- **Sheet:** 360–480px, slides in from the right over content (`--duration-slow` `--ease-emphasis`) so the table stays visible; it overlays, it does not push. Header = the row's primary identifier + close (`x`); body = the full field set as label–value pairs; footer = row actions (Edit, Delete-at-bottom).
- **Keep context:** mark the open row distinctly from checkbox selection — pale-blue tint + 2px left accent, `aria-current="true"` (reserve `aria-selected` for bulk selection). Opening another row swaps the sheet content; sheets never stack.
- **Don't** widen the table past the viewport to fit everything, and don't use a center modal for single-record detail — it blocks the table the user wants to keep scanning.
- A11y: the accessible trigger is a dedicated per-row **View** control — a native `<button>` (so Enter *and* Space activate it) carrying `aria-haspopup="dialog"` + `aria-expanded`. **Don't** put `role="button"` on the `<tr>` — the row contains a checkbox and the actions menu, and a button can't have interactive descendants. The sheet is `role="dialog"` named by the record; `Escape` and the close button dismiss; focus returns to the trigger.

## Sticky elements & horizontal scroll
- Sticky header: `position: sticky; top: 0` on `<thead> <th>`. Offset by top-bar height if applicable.
- Sticky first column on wide tables: `position: sticky; left: 0`, subtle 4px right shadow.
- **Wrap the table in `.table-shell { overflow-x: auto }` AND set `min-width` on the `<table>`** (typically 720–960px). Without the min-width, columns compress and the scroll never triggers — cells wrap, alignment breaks silently.
- Show fade-shadow indicators on left/right edges via the pure-CSS scroll-shadow technique (paired masks + gradients via `background-attachment: local`). **Width:** a data table is a data-dense surface — let the table region go **full-width** (gutters, not a 1200px cap; see `app-shell-and-headers.md`), or it wastes the canvas.

## Pagination
Attached to bottom of table-shell (no gap). Left: "X–Y of Z items." Right: page navigation or load-more. Items-per-page selector persists per user. `<nav aria-label="Table pagination">`.

## Density modes
- **Comfortable** (default) — `--space-3` row padding, 14pt text, 40px input height.
- **Compact** — `--space-2` row padding, 13pt text, 32px input height, 28px buttons.
- Toggle in toolbar (`rows` icon), persists per user.
- **All controls in a row match the row's density.** A 40px input next to a 28px button is broken — switch the input to the compact 32px height.

## In-table states
- **Filtered-to-zero:** a single row spanning all columns with a subtle "no matches" message and a "Clear filters" link, centered. Use `--bg-surface` + a border, never a pale alert fill.
- **Loading:** skeleton rows matching column structure.
- **Error:** error message in the table area with retry.
- **Empty** (never had data): page-level empty state, not inline.

## Responsive
Default: horizontal scroll with fade indicators. Alternative: stacked cards on mobile (each row = card with label-value pairs) when data is browsed sequentially. Pick one per surface and stay consistent.

## Loading / empty / a11y (charts)
Skeleton chart: gray bars/lines at the right shape — don't fake numeric values. Empty: centered icon + one-line message; never show empty axes. Provide a `<table>` equivalent visually hidden for screen readers. Keyboard nav: arrow keys move between data points, Enter announces value. Don't rely on color alone — pair series color with line style or marker.

## McDermott-specific
Chart background: transparent on cards, `--bg-surface` standalone. All chart text in `--font-sans` (never `--font-mix`). KPI numbers: `--font-mix`, 48–64pt, -3% tracking. Hover row tint: `--color-pale-blue` at ~0.4 opacity.

## Responsive (narrow viewports)
- **KPI values** at 48px overflow narrow cards when long ("$1,234,567"). Drop to 36px at ≤480px + `word-break: break-word`. `min-width: 0` on `.kpi`.
- **Horizontal bar rows** with `100px 1fr 60px` columns are too greedy on phones. At ≤480px restructure so label sits above bar with value inline at right.
- **KPI grids** use `repeat(auto-fit, minmax(min(100%, 220px), 1fr))` (the `min(100%, X)` floor).

## Anti-patterns
- Pie charts with >5 slices · 3D or dual-axis charts · truncated y-axis on bar charts
- Rainbow categorical palettes · color as the only series differentiator
- Empty axes shown when data is loading
- Centering numeric columns · vertical rules between columns
- Serif (`--font-mix`/Georgia) in table cells — data is for scanning; use `--font-sans`, `ui-monospace` for numerals
- Make every column sortable · hide row actions on touch
- Persist row selection silently across page changes
- `overflow-x: auto` on a table without `min-width` on the `<table>`
- Bar row with fixed-px columns and no responsive collapse
