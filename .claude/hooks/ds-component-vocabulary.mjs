// ds-component-vocabulary.mjs — the ONE source of truth for "what is a
// design-system component" in the per-component design-fidelity review.
//
// Two consumers share this so they can never drift apart:
//   - enumerate-prototype-components.mjs walks a RENDERED DOM (via CDP) and
//     classifies each element, injecting this map into the in-page script.
//   - verify-design-fidelity-manifest.mjs STATICALLY parses the prototype
//     bundle HTML (no browser) to derive the ground-truth component set the
//     evidence manifest must cover.
//
// Matching prototype↔build is by (screen, type, ordinal) — NOT by selector,
// because the build uses CSS/SCSS Modules (hashed class names). The prototype
// is classified by its MWS design-system class tokens; the build is classified
// by the mandated `data-ds="<type>"` attribute (see rules/dev/web-styling.md).
// The two media are classified by the SAME canonical type vocabulary below.

// Attribute the BUILD stamps on each design-system component's root element.
export const DS_ATTR = 'data-ds';

// Canonical component type ← MWS root class token. Keys are the ROOT class
// tokens only (BEM-style: `class="btn btn-primary"` carries the root `btn`);
// helper/sub-element classes (`card-body`, `alert-title`, `bar-fill`) are NOT
// roots and never classify an element as a component. Derived from
// templates/artifacts/docs/design/mws-design-system-showcase.html.
export const DS_TYPE_BY_ROOT_CLASS = {
  btn: 'btn',
  card: 'card',
  badge: 'badge',
  chip: 'chip',
  alert: 'alert',
  stepper: 'stepper',
  tabs: 'tabs',
  tab: 'tab',
  modal: 'modal',
  sheet: 'sheet',
  popover: 'popover',
  toast: 'toast',
  skeleton: 'skeleton',
  field: 'field',
  input: 'input',
  toggle: 'toggle',
  sidebar: 'sidebar',
  nav: 'nav',
  menu: 'menu',

  // ── Claude Design (MWS) prototype roots ──────────────────────────────────
  // The Claude Design export marks design-system components with `mws-<type>`
  // BEM ROOT classes; the built app stamps `data-ds="<type>"`. These entries
  // let the SAME enumerator classify the prototype side, mapped to the SAME
  // canonical type strings the build emits (so prototype↔build match by
  // (type, ordinal)). ROOT tokens only — sub-elements (`mws-card__body`) and
  // modifiers (`mws-btn--primary`) are intentionally absent, exactly like the
  // unprefixed set above. Where the two taxonomies diverge (build app-composite
  // types vs prototype primitives) the mismatch surfaces as a real finding, not
  // a silent hide.
  'mws-btn': 'btn',
  'mws-iconbtn': 'icon-btn',
  'mws-card': 'card',
  'mws-badge': 'badge',
  'mws-status': 'status-pill',
  'mws-chip': 'chip',
  'mws-prompt-chip': 'chip',
  'mws-alert': 'alert',
  'mws-stepper': 'stepper',
  'mws-tabs': 'tabs',
  'mws-tab': 'tab',
  'mws-modal': 'modal',
  'mws-sheet': 'sheet',
  'mws-popover': 'popover',
  'mws-skel': 'skeleton',
  'mws-field': 'field',
  'mws-input': 'input',
  'mws-select': 'select',
  'mws-textarea': 'input',
  'mws-switch': 'toggle',
  'mws-check': 'checkbox',
  'mws-radio': 'radio',
  'mws-table': 'table',
  'mws-sidebar': 'sidebar',
  'mws-nav-item': 'nav-item',
  'mws-topbar': 'topbar',
  'mws-lockup': 'lockup',
  'mws-menu': 'menu',
};

// Elements that LOOK interactive. Any of these that classifies to no known
// type is emitted as UNKNOWN-INTERACTIVE so an unrecognized class surfaces as a
// blocking signal rather than hiding (the same coverage hole, one level down).
export const INTERACTIVE_SELECTOR =
  'button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="menuitem"], [tabindex]';

// Layout-significant computed-style properties diffed per component. render-
// states.mjs emits these (default state) for a selector; verify-design-
// fidelity-manifest.mjs diffs prototype vs build with: a px-length value is
// compared within ±1px; everything else (keywords, numeric font-weight,
// normalized rgb colors) must match exactly. This set is what catches the
// flex:1 / width / packed-vs-distributed class of drift a screenshot misses.
export const COMPUTED_STYLE_PROPS = [
  // box / flex geometry
  'display', 'flex-direction', 'flex-grow', 'flex-shrink', 'flex-basis',
  'justify-content', 'align-items', 'gap', 'row-gap', 'column-gap',
  'width', 'height', 'position',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  // token-bound typography / color / border
  'font-size', 'font-weight', 'line-height', 'color', 'background-color',
  'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-right-radius', 'border-bottom-left-radius',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
];

// Classify a set of class tokens → canonical type, or null. First root token
// wins (document order of the map is irrelevant; a single element rarely
// carries two distinct roots). Used by the static (Node) parse; the in-page
// walk applies the same map via classList.
export function classifyClassTokens(tokens) {
  for (const token of tokens) {
    if (Object.prototype.hasOwnProperty.call(DS_TYPE_BY_ROOT_CLASS, token)) {
      return DS_TYPE_BY_ROOT_CLASS[token];
    }
  }
  return null;
}
