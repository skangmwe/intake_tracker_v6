# Styling

Visual design tokens, color palette, typography, breakpoints, theme tokens, and the responsive system are owned by the **design system** in `rules/design/_core-requirements.md` and its companions (especially `responsive-and-mobile.md`). This file covers only the dev-side CSS implementation choices that the design system does not dictate.

- **SCSS Modules** — required for all component-scoped styles.
- **Container Queries** — prefer over media queries when the layout depends on the component's container width, not the viewport.
- No inline styles except for truly dynamic values (e.g., calculated widths set via JS).
- No CSS-in-JS libraries (styled-components, Emotion, etc.).
- Use `color-mix()` for semi-transparent tints rather than hardcoded `rgba` values.
- Use `min-height: 100dvh` (dynamic viewport height) rather than `100vh` for full-height layouts.
- **`data-ds` on design-system components (required — the design-fidelity review depends on it).** Every component that implements a design-system element from the prototype (button, card, stepper, tabs, badge/status, chip, toggle, input, menu/popover, alert, …) MUST set a stable `data-ds="<type>"` on its root element, using the canonical type name from the MWS design-system showcase (e.g. `data-ds="stepper"`, `data-ds="btn"`, `data-ds="tab"`). SCSS Modules hash class names, so `data-ds` is the only stable handle `/dev-review-and-remediate`'s design-fidelity step uses to pair a built component with its prototype counterpart and diff it per-component (geometry + interaction states). **A design-system component missing `data-ds` is invisible to the per-component gate and fails the review as a missing component.** Plain layout wrappers with no prototype counterpart don't need it.
