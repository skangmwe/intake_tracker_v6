---
name: McDermott Application Lockup & Naming
description: 'Use when placing an application''s identity in a UI — the McDermott symbol + divider + app name lockup, where it appears (sidebar header, top bar, login), how the name is set and wrapped, app naming conventions, and the UI-vs-marketing distinction. Load whenever an app needs a name or brand mark on screen.'
version: 1.0.0
---
# McDermott Application Lockup & Naming
Every AI app shares one identity system — the **McDermott symbol + a divider + the application name**. No bespoke per-app logos. The divider signals the app is a *function inside the master brand*, not a standalone product.

## The lockup
`[ ◯M ] │ Application Name` — three parts, left to right:
1. **Symbol** — the McDermott mark (see slot below).
2. **Divider** — a thin vertical rule. This is the master-brand cue; never omit it in UI.
3. **Name** — the application name in Georgia.

Spacing: symbol → `--space-3` → divider → `--space-3` → name. The whole lockup is one inline-flex unit, vertically centered.

## The symbol
The symbol is the single source asset, embedded inline so it travels with this file (no separate asset folder). It uses `fill="currentColor"`, so it takes the color of whatever surface it sits on — no per-theme files. This is the official McDermott vector; do not redraw, re-trace, or substitute.

```html
<svg class="lockup__symbol-svg" viewBox="0 0 171.84 171.84" xmlns="http://www.w3.org/2000/svg" fill="currentColor" role="img" aria-label="McDermott">
  <path d="M43,85.12l22.6,36.87h-22.6v-36.87ZM113.34,121.9h16.81V47.95h-16.81v73.95ZM42.17,47.95l47.09,76.79,8.38-20.04-34.79-56.75h-20.67ZM171.84,85.92c0,47.37-38.55,85.92-85.92,85.92S0,133.29,0,85.92,38.55,0,85.92,0s85.92,38.55,85.92,85.92ZM162.77,85.92c0-42.37-34.47-76.85-76.85-76.85S9.07,43.55,9.07,85.92s34.47,76.85,76.85,76.85,76.85-34.47,76.85-76.85Z"/>
</svg>
```

The path is square (`viewBox 0 0 171.84 171.84`) and carries no hardcoded width/height/color — the `.lockup__symbol` box sizes it and `currentColor` colors it. This single inline mark serves every surface and theme; there are no separate per-color asset files to manage. (Fixed-color exports — navy, blue, teal, white — exist in the brand library if ever needed outside the product, but UI always uses the `currentColor` version above.)

Sizes: **32px** in a sidebar header or top bar; **48–64px** on a login/splash screen. Never between the scale steps. Keep the symbol's circle intact — don't crop or recolor per app.

## The divider
1px wide, height matched to the lockup (min 24px), in the surface's foreground color at low opacity: `color-mix(in srgb, currentColor 22%, transparent)`. It relates to its surface automatically. Never a heavy or full-height rule.

## The name
- Font: `--font-mix` (Georgia) — web-safe, matches the brand.
- Size: 18px in headers (scale up proportionally on splash screens).
- Case: **Title Case** (see `ux-copy-and-microcopy.md`).
- Weight: regular.
- **Wraps to two lines maximum**, left-aligned, vertically centered to the symbol. If it can't fit two readable lines, the name is too long — tighten the wording, never shrink the type below readable.

## Color by surface
The lockup inherits `currentColor`; set `color` from the surface it sits on:
- **Navy sidebar** (navy in both themes): white — symbol, name, and divider derive from `--color-white`. This is the primary case.
- **Light surfaces** (top bar, light login): `--text-primary` — navy in light, white in dark.

Blue and teal symbol variants are reserved; the standard lockup is white-on-navy or navy/white-by-theme. Never place the white symbol on a light surface (invisible) or navy on navy.

## Placement — in priority order
1. **Sidebar header** (primary) — top of the sidebar, above the nav. This is the app's home for its identity. See `navigation-and-ia.md`.
2. **No sidebar?** Leading (left) position of the top bar / app header — distinct from the page-title slot, which names the current *page*, not the app. See `app-shell-and-headers.md`.
3. **Login / splash / empty first-run** — centered, at the larger symbol size.

The lockup is app identity; it appears once per surface. It does not repeat in the top bar when the sidebar already shows it.

## Responsive
- **Collapsed sidebar** (72px) or **≤360px**: show the **symbol only** — hide the divider and name. The mark alone carries identity at small sizes.
- The two-line name wrap is what lets longer, descriptive names fit; never let the name push the sidebar wider (`min-width: 0` on the lockup).

## Naming convention (interim — Brand to finalize)
Names are **descriptive, plain real words**, specific enough to stay distinct across hundreds of apps.
- **Lead with the domain/object, then the function:** "Deposition Summarizer", "Privilege Log Analyzer", "Contract Clause Finder".
- **Avoid bare function words** ("Indexer", "Analyzer", "Tracker") — they collide at scale.
- No invented or branded names, no acronyms, codenames, or version numbers.
- Title Case; ~2–4 words; must fit the two-line lockup.
- **UI vs marketing:** UI uses the full lockup; **Marketing/BD uses the name in text only — never the lockup.**

## Reference snippet
```html
<span class="lockup">
  <span class="lockup__symbol"><!-- inline McDermott symbol SVG, fill="currentColor" (see The symbol) --></span>
  <span class="lockup__divider" aria-hidden="true"></span>
  <span class="lockup__name">Deposition Summarizer</span>
</span>
```
```css
.lockup { display: inline-flex; align-items: center; gap: var(--space-3); min-width: 0; }
.lockup__symbol { width: 32px; height: 32px; flex-shrink: 0; }
.lockup__symbol svg { width: 100%; height: 100%; fill: currentColor; }
.lockup__divider { width: 1px; align-self: stretch; min-height: 24px; flex-shrink: 0;
  background: color-mix(in srgb, currentColor 22%, transparent); }
.lockup__name { font-family: var(--font-mix); font-size: 18px; line-height: 1.15;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
/* Sidebar header: color: var(--color-white). Light surface: color: var(--text-primary). */
```

## Anti-patterns
- Omit the divider in UI (it's the master-brand cue)
- Bespoke or per-app logos · recolored or cropped symbols
- White symbol on a light surface / navy symbol on navy (invisible)
- Name in a font other than Georgia (`--font-mix`)
- Title Case dropped, or ALL-CAPS app names
- Names longer than two lines, or type shrunk to force a fit
- Bare generic function names ("Indexer") that collide at scale
- The lockup in marketing/BD materials (text-only there)
- Repeating the lockup in the top bar when the sidebar already shows it
