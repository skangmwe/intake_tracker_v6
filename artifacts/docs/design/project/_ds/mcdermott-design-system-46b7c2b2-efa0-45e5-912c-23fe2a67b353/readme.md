# McDermott Design System

**Version 1.4 · 2026.07.02**

The shared design system for McDermott's internal AI applications. Every app shares one identity — a single M-in-circle symbol + a divider + the application name in Georgia. Navy base, pale accents, one interactive accent per theme. Consciously restrained.

Sources this system was built from (read-only, not shipped):
- Attached local folder: `DesignSystem-main 2026.07.02/DesignSystem-main/` — 8 spec Markdown files plus a live HTML showcase. Copied into `source_docs/` in this project.
- No Figma file, no GitHub repo, no separate font/logo assets. The type stack is system fonts; the McDermott mark ships as an inline SVG (`assets/mcdermott-symbol.svg`).

## Non-negotiables

1. **Navy + pale + accent.** Saturated colors are targeted spice, not defaults.
2. **`--color-teal` direct** only for the sidebar's active state and categorical chart series. Everything else interactive uses `var(--accent-interactive)` — blue in light, teal in dark.
3. **Text on pale and alert fills is always navy**, never `var(--text-primary)` (which flips with theme).
4. **Border radius is 2px or 999px.** Nothing in between.
5. **Buttons never wrap** (`white-space: nowrap`).
6. **Stepper = circles on a continuous 1px track.** Never bordered rectangles per step.
7. **Below 1024px the sidebar becomes a slide-in drawer** with scrim — never stacks above content, never disappears.
8. **Mobile is editing, not scaling** — every element gets one of five treatments (keep / remove / move / reshape / replace).
9. **WCAG 2.2 AA floor.** Touch targets ≥ 24×24, focus rings always visible, color is never the sole indicator of state.
10. **Every generation is responsive**, from 320px to 1920px+.

The full constitution is in `source_docs/_core-requirements.md`; the eight companion specs live alongside it.

---

## Content fundamentals

**Voice:** *Precise. Warm. Confident. Never cute. Editorial in headlines, neutral in UI.*

- **Sentence case for headlines and page titles.** Never Title Case. Proper nouns keep their casing.
- **ALL CAPS for eyebrows, labels, buttons.** With 5–10% letter-spacing.
- **Buttons are verb + noun** — "Save changes", "Generate brief", "File brief". Never "OK", "Yes", "Submit".
- **Errors: what happened → why → how to fix.** No "Oops!", "Whoops!", "Just", "Simply", no exclamation marks.
- **AI confidence is linguistic** ("may", "likely") — never numeric percentages.
- **Optional is marked, not required.** No asterisks.
- **Second person for UI copy** ("Your matters", "You have 3 unsaved changes"). First person only for AI voice, and even there sparingly.
- **No emoji** in product surfaces. Ever. Use Phosphor icons.
- **Application names are Title Case, ~2–4 words, domain-first-then-function** ("Deposition Summarizer", not "Summarizer"). Set only in Georgia.

Example — a save error done right:
> Your changes weren't saved. The server didn't respond within 30 seconds. Try again, or open a new session if the issue persists.

Wrong:
> Oops! Something went wrong! Please try again.

---

## Visual foundations

**Palette.** Navy `#000042` is the base — it's the sidebar (both themes), primary text on light, and the scrim tint. `#0018F2` blue is the light-mode accent; `#00E2C1` teal is the dark-mode accent AND the reserved sidebar-active/chart-series color. Five *pale* tokens (`pale-blue`, `pale-magenta`, `pale-orange`, `pale-gold`, `pale-success`) are theme-stable — they don't flip between light and dark, and text on them is always navy. Three alert tokens (`error`, `success`, `warning`) are background fills only. Secondary colors (`magenta`, `orange`, `gold`) appear as chart series or occasional card top-strokes. `neon` is a max-attention-only color; use it once per surface at most.

**Typography.** System sans (`-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`) for body, UI, buttons, tables, and data. **Georgia** (`--font-mix`) for navigation links, display headings, and card titles — never for table cells or dense data. Scale: Display 64/44/32 responsive, H1 44, H2 32, H3 24, Body Large 20 (Light), Body 16, Caption/Eyebrow 13.

**Spacing.** 4px base grid. Nine tokens (4/8/12/16/24/32/48/64/96). Rhythm: `--space-4` between siblings within a section, `--space-6` between sections, `--space-8` between major regions. Never write arbitrary px.

**Backgrounds.** Solid tokens only. **No gradients, no textures, no illustrations behind content, no repeating patterns.** Two surfaces per theme: `--bg-page` (subtle off-navy on light, deep navy on dark) and `--bg-surface` (crisp white / navy-blue). The sidebar is navy in both themes. Full-bleed imagery only appears in cards' optional 400×400 image slot.

**Borders.** 1px `--border-light` for everything structural. 2px only appears as a bottom-border on active tabs (`--accent-interactive`) or a left-rail on active nav items — signal, not framing. Never 2px navy/black around cards.

**Radii.** 2px or 999px (pills). Buttons, cards, inputs, sheets, modals — all 2px. Badges and status pills — 999px. There is no in-between value in this system.

**Shadows.** Three tokens (`sm`, `md`, `lg`), reserved for elevation hierarchy (dropdowns, popovers, modals). Most surfaces have no shadow. Cards use a border, not a shadow, at rest; on hover they can `translateY(-2px)` + `--shadow-md`.

**Animation.** Tokenized durations (100/200/300/500ms) and three eases — standard, emphasis (entering), exit (leaving). Signature motions: sheet/drawer slide + opacity (`--duration-slow` `--ease-emphasis`), modal `scale(0.96)→1`, list reveal (fade + 8px rise, 40–60ms staggered), skeleton→content crossfade, KPI count-up over `--duration-deliberate`, value-change tint fade. **No bounce, no spring, no wobble, no confetti.** Nothing in UI runs longer than 500ms. Always animate `transform` and `opacity`, never `width`/`height`/`top`/`left`.

**Hover states.** Clickable text-bearing elements (links, nav, content titles, chips) flip **both** border and text color to `--accent-interactive`. Solid button variants fill on hover instead (Secondary → navy fill light / teal fill dark). Cards lift 2px with a `--shadow-md`.

**Press/active states.** One step darker; no movement. Destructive buttons darken red rather than hover-flip.

**Focus states.** 2px `--focus-ring` outline, 2px offset (3px on buttons). Always visible — `outline: none` without a visible replacement is forbidden.

**Transparency & blur.** Scrim behind modals and drawers uses `--scrim` with a 4px `backdrop-filter: blur(4px)` where supported. Otherwise the system is crisp — no glass, no frosted panels.

**Imagery.** Cool, professional, restrained. No warm grain, no hand-drawn illustrations. The system does not ship illustration or photography — apps supply their own imagery per the 400×400 card slot.

**Layout.** The reading/forms canvas caps at `min(100%, 1200px)` and centers (`margin-inline: auto`). Data-dense surfaces (tables, dashboards) go full-width with symmetric gutters (`--space-6`/`--space-8`). Top bar sticky, 56px. Sidebar sticky (desktop), drawer (mobile). Content scrolls on `html`.

**Density.** Comfortable (default) uses `--space-3` row padding, 14pt text, 40px inputs. Compact uses `--space-2`, 13pt text, 32px inputs. Controls in a row must share a density.

---

## Iconography

**Source:** Phosphor Icons, **Regular weight only** (2px stroke, monoline, no fill). Loaded via CDN — the design system ships no icon files. Any consuming project pulls Phosphor from `https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css` and uses `<i class="ph ph-cloud-check" aria-hidden="true"></i>` or the React package.

**Substitution flag:** The source specs name Phosphor as the icon system and the showcase HTML uses the Phosphor web CDN. **No local icon files were shipped in the source folder, so we link Phosphor from CDN** — this matches source intent exactly.

- **Sizes:** 16 / 20 / 24 / 32 / 48 / 64px. Never in between.
- **Weight:** Regular only. **Filled and duotone variants are forbidden.**
- **Color:** `var(--icon-default)` by default (navy on light, teal on dark). Interactive icons use `var(--accent-interactive)`.
- **In buttons:** locked to 16px.
- **In sidebar rails:** 20px.
- **Emoji:** never used in product UI.
- **Unicode-as-icon** (`→`, `·`, `—`) allowed only where noted (em-dash for empty table cells, mid-dot for compact status separators).
- **No hand-rolled SVGs for icon needs.** The one exception is the McDermott mark itself, which ships inline (`assets/mcdermott-symbol.svg`).
- **A11y:** decorative icons paired with text labels use `aria-hidden="true"`. Icon-only buttons require `aria-label`.

---

## What's in this folder

| Path | What it is |
|---|---|
| `styles.css` | Global entry — `@import`s every token file. Consumers link this. |
| `tokens/` | Colors, typography, spacing, radius, elevation, motion, breakpoints, base reset. |
| `assets/` | The McDermott M-in-circle SVG mark. |
| `components/` | Reusable React primitives — grouped by concern (`brand/`, `buttons/`, `forms/`, `feedback/`, `disclosure/`, `nav/`, `data/`, `ai/`). |
| `foundations/` | Small specimen HTML cards that populate the Design System tab. |
| `ui_kits/` | Full-screen interactive product recreations. |
| `templates/` | Starter `.dc.html` templates (deck, wizard app shell) for consuming projects. |
| `source_docs/` | Read-only copy of the McDermott spec Markdown and showcase HTML. |
| `SKILL.md` | Cross-compatible skill entry point (for use inside Claude Code / Agent Skills). |

## Component inventory

Built from the source spec's explicit families (nothing added, nothing invented). Grouped by concern:

- **brand/** — `Lockup`
- **buttons/** — `Button`, `IconButton`, `Link`
- **forms/** — `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Switch`
- **feedback/** — `Alert`, `Toast`, `Badge`, `Skeleton`, `EmptyState`, `StatusIndicator`
- **disclosure/** — `Modal`, `SideSheet`, `Popover`, `Accordion`, `Tabs`
- **nav/** — `Sidebar`, `NavItem`, `TopBar`, `Breadcrumb`, `IdentifierBadge`
- **data/** — `Card`, `KPICard`, `Table`, `Stepper`, `InfoStepper`
- **ai/** — `SparkleLabel`, `ThinkingDots`, `PromptChip`, `ToolCallRow`, `PermissionPrompt`

## Intentional additions

None. The set above matches families the source spec explicitly names.

## UI kits

- **Brief Builder** (`ui_kits/brief_builder/`) — the source's canonical multi-step wizard example (Setup → Processing → Review → Summary), demonstrating the stepper + sidebar-omission rule and the AI-generated brief output.
- **Matters Table** (`ui_kits/matters_table/`) — data-dense table surface demonstrating filter/sort/select/bulk-actions/row-detail-sheet, per the data-viz spec.

## Missing assets flagged

- **No fonts to ship.** System stack per spec.
- **No logo files beyond the M-in-circle SVG.** Never generate additional marks.
- **No Phosphor local files** — pulled from CDN as source intent.
