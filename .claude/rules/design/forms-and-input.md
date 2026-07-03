---
name: McDermott Forms & Input
description: 'Use when building forms, inputs, text fields, selects, dropdowns, checkboxes, radios, toggles, file uploads, validation, error messages, multi-step forms, required fields, password fields, search inputs, or any input collection.'
version: 1.0.0
---
# McDermott Forms & Input
The workhorse of enterprise UI. Get this right and the rest looks effortless.
## Field anatomy
Every field has up to five parts, in this order:
1. **Label** — `--font-sans`, 14pt, sentence case, `var(--text-primary)`. Always visible. Never use placeholder-as-label.
2. **Optional helper text** — 13pt, `var(--text-secondary)`. Below the label, above the input.
3. **Input** — height `var(--control-h)` (40px), 1px border `var(--border-light)`, `var(--radius)` (2px), `var(--space-3)` (12px) horizontal padding.
4. **Error message** (replaces helper on error) — 13pt, `var(--color-navy)` text on `var(--color-error)` background OR navy text with a small Phosphor `warning-circle` icon for inline errors without a fill.
5. **Character count** (optional) — right-aligned under input, 12pt, `var(--text-secondary)`.
## Required vs optional
- **Mark optional fields**, not required. (Most fields are required; marking the minority reduces noise.)
- "(optional)" appended to the label, `var(--text-secondary)`.
- Never use `*` for required — it's a learned convention but ambiguous to new users.
## Input states
| State | Treatment |
|---|---|
| Default | 1px `var(--border-light)` border |
| Hover | Border `var(--text-secondary)` |
| Focus | 2px outline `var(--focus-ring)` with 2px offset, border stays default |
| Filled | Default border, value visible |
| Error | 1px `var(--color-error)` border, error message below |
| Disabled | `opacity: 0.4`, no pointer events |
| Read-only | No border, value as plain text |
## Validation timing
- **On blur** for individual fields (after the user has committed to a value).
- **On submit** for the whole form (catches anything missed on blur).
- **Real-time only** for password strength indicators and character limits.
- **Never on keystroke** for anything else — it's hostile UX.
## Error message formula
Form errors follow the **what + why + how to fix** pattern. `ux-copy-and-microcopy.md` is the canonical owner of the formula, the do/don't examples, and the banned phrases — load it alongside this file when writing field-level error copy. For forms specifically: error messages replace helper text in the same slot, are 13pt, and use navy text on `--color-pale-orange` fill — never error-red text. Never blame the user ("You entered an invalid…"); take responsibility for ambiguity.
## Specific input types
- **Text** — single line. Use `inputmode` to surface the right mobile keyboard (`numeric`, `email`, `tel`, `url`).
- **Number** — use `inputmode="numeric"` and `pattern="[0-9]*"` instead of `type="number"` for most cases (avoids browser stepper UI on mobile).
- **Password** — include a "show password" toggle (Phosphor `eye` / `eye-slash`).
- **Date** — native `<input type="date">` for desktop; custom picker only when range or constraints require it.
- **File upload** — show drag-and-drop affordance + traditional button. Display selected file name and size. Allow remove.
- **Search** — leading Phosphor `magnifying-glass` icon, optional clear button, submit on Enter.
- **Select** — native `<select>` for ≤10 options. Custom combobox for searchable, multi-select, or grouped options.
- **Checkbox / radio** — 18px square (checkbox) or circle (radio), 2px border. Checked fill uses `var(--accent-interactive)` — blue in light mode, teal in dark. Check mark is white in light, navy in dark (sufficient contrast on the accent fill in each theme).
- **Toggle** — for binary settings that take effect immediately. The "on" track fills with `var(--accent-interactive)` (blue light / teal dark). Use a checkbox instead if it's part of form submission.
- **Segmented controls / button groups** (e.g., `Linear · Priority · TAR`) — a row of mutually-exclusive options where one is selected at a time.
  - Each segment is a button-styled cell with 1px `--border-light` borders (shared border between adjacent segments), `--bg-surface` background, `--text-primary` text.
  - Selected segment: `--accent-interactive` 1.5px border, `--text-primary` text in 500-weight, optional `--color-pale-blue` background tint.
  - **Mobile behavior is mandatory:** below 640px, segmented controls must either (a) wrap to multiple rows via `flex-wrap: wrap`, (b) convert to a native `<select>` dropdown (best for 3+ options), or (c) use a horizontal scroll container with the scroll-shadow pattern from `data-visualization.md`. Never let them overflow the container or cut off — that's the most common card-content mobile failure.
  - Pick one mobile strategy per surface and stay consistent.

## Multi-step forms
- Show progress (Step 2 of 4 + visual indicator).
- Allow back navigation; preserve already-entered data.
- Validate per-step on Next, not retroactively.
- Save draft state on every step change (autosave or explicit).
- Final step is review + submit, not submit-and-pray.
## Mobile keyboard handling
- Use `autocomplete` attributes (`given-name`, `email`, `current-password`) so password managers and autofill work.
- Use `inputmode` for keyboard variants.
- Never disable autofill or paste — it breaks password managers and accessibility.
- Avoid `autofocus` on page load (causes viewport jump on mobile).
## McDermott-specific
- Form layouts: single-column by default. Two columns only when fields are obviously paired (first/last name, city/zip).
- Submit button: primary button, right-aligned in form footer. Cancel/back is a secondary button to its left.
- Required fields with `var(--color-error)` border use navy text in the error message, never error-red text.
- Field width matches expected input length when possible (zip code = short, address = full width).

## Input width in flex and grid layouts
A native `<input>` has a ~200px intrinsic width (default `size`), and `type="number"`, `type="date"`, and `<select>` each size to their own content. So inputs overflow flex rows on narrow phones, and a multi-column form renders ragged when mixed types size differently. One rule fixes both — every control fills its cell, and the grid/flex column owns the width:

```css
input, select, textarea {
  width: 100%;             /* fill the cell — equal width across input types */
  box-sizing: border-box;  /* padding/border don't change rendered width */
  min-width: 0;            /* allow shrink in flex/grid; no overflow */
}
```

Applies equally to `<textarea>`. See `McDermott Responsive & Mobile` ("Native `<input>` intrinsic width"). Prefer `inputmode="numeric"` over `type="number"` (per *Specific input types*) to also drop the stepper UI.

## Anti-patterns — Never Do This
- Use placeholder text as the only label
- Use `*` to denote required (mark optional instead)
- Validate on every keystroke for non-strength-meter inputs
- Show generic error messages ("Invalid", "Required", "Error")
- Apply alert color (`--color-error` red) to text — it's a background fill only; error text is navy
- Disable copy/paste in password fields
- Hide the submit button until the form is "valid" (frustrates users who want to see what's missing)
- Auto-advance focus after typing N characters (breaks paste, breaks editing)
- Reset the entire form on a single error
- Use `type="number"` for things that aren't actually numeric (phone, ZIP, credit card)
- Skip `width: 100%` / `min-width: 0` on inputs in flex or grid layouts — they overflow narrow rows, and mixed `type="number"` / `type="date"` / `<select>` render at ragged widths.
