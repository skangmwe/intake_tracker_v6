/* @ds-bundle: {"format":4,"namespace":"McDermottDesignSystem_46b7c2","components":[{"name":"PermissionPrompt","sourcePath":"components/ai/PermissionPrompt.jsx"},{"name":"PromptChip","sourcePath":"components/ai/PromptChip.jsx"},{"name":"SparkleLabel","sourcePath":"components/ai/SparkleLabel.jsx"},{"name":"ThinkingDots","sourcePath":"components/ai/ThinkingDots.jsx"},{"name":"ToolCallRow","sourcePath":"components/ai/ToolCallRow.jsx"},{"name":"Lockup","sourcePath":"components/brand/Lockup.jsx"},{"name":"Button","sourcePath":"components/buttons/Button.jsx"},{"name":"IconButton","sourcePath":"components/buttons/IconButton.jsx"},{"name":"Link","sourcePath":"components/buttons/Link.jsx"},{"name":"Card","sourcePath":"components/data/Card.jsx"},{"name":"InfoStepper","sourcePath":"components/data/InfoStepper.jsx"},{"name":"KPICard","sourcePath":"components/data/KPICard.jsx"},{"name":"Stepper","sourcePath":"components/data/Stepper.jsx"},{"name":"Table","sourcePath":"components/data/Table.jsx"},{"name":"SortHeader","sourcePath":"components/data/Table.jsx"},{"name":"Accordion","sourcePath":"components/disclosure/Accordion.jsx"},{"name":"Modal","sourcePath":"components/disclosure/Modal.jsx"},{"name":"Popover","sourcePath":"components/disclosure/Popover.jsx"},{"name":"PopoverItem","sourcePath":"components/disclosure/Popover.jsx"},{"name":"PopoverDivider","sourcePath":"components/disclosure/Popover.jsx"},{"name":"SideSheet","sourcePath":"components/disclosure/SideSheet.jsx"},{"name":"Tabs","sourcePath":"components/disclosure/Tabs.jsx"},{"name":"Alert","sourcePath":"components/feedback/Alert.jsx"},{"name":"Badge","sourcePath":"components/feedback/Badge.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"Skeleton","sourcePath":"components/feedback/Skeleton.jsx"},{"name":"StatusIndicator","sourcePath":"components/feedback/StatusIndicator.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Field","sourcePath":"components/forms/Field.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"Breadcrumb","sourcePath":"components/nav/Breadcrumb.jsx"},{"name":"IdentifierBadge","sourcePath":"components/nav/IdentifierBadge.jsx"},{"name":"NavItem","sourcePath":"components/nav/NavItem.jsx"},{"name":"Sidebar","sourcePath":"components/nav/Sidebar.jsx"},{"name":"TopBar","sourcePath":"components/nav/TopBar.jsx"}],"sourceHashes":{"components/ai/PermissionPrompt.jsx":"dfd3f6f7daa5","components/ai/PromptChip.jsx":"c5ae429c5a31","components/ai/SparkleLabel.jsx":"00a1619cac5e","components/ai/ThinkingDots.jsx":"fd37878cee03","components/ai/ToolCallRow.jsx":"74afc46d0f31","components/brand/Lockup.jsx":"892caccbef5a","components/buttons/Button.jsx":"01fa5d679bf2","components/buttons/IconButton.jsx":"1cc64ad36cfa","components/buttons/Link.jsx":"3218f571e621","components/data/Card.jsx":"c834e8917833","components/data/InfoStepper.jsx":"f555afa7ed91","components/data/KPICard.jsx":"4ccc67a8ed8e","components/data/Stepper.jsx":"fa85287d78e9","components/data/Table.jsx":"566624fcf86f","components/disclosure/Accordion.jsx":"fe258b6ec696","components/disclosure/Modal.jsx":"d46be110113c","components/disclosure/Popover.jsx":"0896e2764c32","components/disclosure/SideSheet.jsx":"8c8e20679bf7","components/disclosure/Tabs.jsx":"3105c05ccbd1","components/feedback/Alert.jsx":"55c2c92f19c0","components/feedback/Badge.jsx":"53cf77da09c3","components/feedback/EmptyState.jsx":"c5e334940674","components/feedback/Skeleton.jsx":"8c2f46916b73","components/feedback/StatusIndicator.jsx":"57cdd883344d","components/feedback/Toast.jsx":"423824d3e600","components/forms/Checkbox.jsx":"cfde0abedc34","components/forms/Field.jsx":"40f48931800d","components/forms/Input.jsx":"9e6f7dc2cf2b","components/forms/Radio.jsx":"c39e3aaf6513","components/forms/Select.jsx":"d7c3ada224a9","components/forms/Switch.jsx":"192877d61770","components/forms/Textarea.jsx":"bc7d909ffd4e","components/nav/Breadcrumb.jsx":"c28348e71cb0","components/nav/IdentifierBadge.jsx":"be997a23a7be","components/nav/NavItem.jsx":"72875e245b63","components/nav/Sidebar.jsx":"d539b2d8589f","components/nav/TopBar.jsx":"cd58416f7225"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.McDermottDesignSystem_46b7c2 = window.McDermottDesignSystem_46b7c2 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/ai/PermissionPrompt.jsx
try { (() => {
/** Permission prompt for destructive / external AI actions — always names the consequence. */
function PermissionPrompt({
  title,
  children,
  onApprove,
  onCancel,
  approveLabel = 'Approve',
  cancelLabel = 'Cancel'
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "mws-permission",
    role: "alertdialog"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mws-permission__title"
  }, title), /*#__PURE__*/React.createElement("div", null, children), /*#__PURE__*/React.createElement("div", {
    className: "mws-permission__actions"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "mws-btn mws-btn--primary",
    onClick: onApprove
  }, approveLabel), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "mws-btn mws-btn--secondary",
    onClick: onCancel
  }, cancelLabel)));
}
Object.assign(__ds_scope, { PermissionPrompt });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/ai/PermissionPrompt.jsx", error: String((e && e.message) || e) }); }

// components/ai/PromptChip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Suggested prompt chip. Never all of them — 3–5 max per empty state. */
function PromptChip({
  icon,
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: "mws-prompt-chip"
  }, rest), icon && /*#__PURE__*/React.createElement("i", {
    className: `ph ph-${icon}`,
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("span", null, children));
}
Object.assign(__ds_scope, { PromptChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/ai/PromptChip.jsx", error: String((e && e.message) || e) }); }

// components/ai/SparkleLabel.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** "Generated" label with sparkle. Small caps in --accent-interactive. */
function SparkleLabel({
  children = 'Generated',
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: ['mws-sparkle', className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement("i", {
    className: "ph ph-sparkle",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("span", null, children));
}
Object.assign(__ds_scope, { SparkleLabel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/ai/SparkleLabel.jsx", error: String((e && e.message) || e) }); }

// components/ai/ThinkingDots.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Three pulsing dots — use for waits ≥ 2s. Never a generic spinner. */
function ThinkingDots({
  label = 'Thinking',
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: className,
    "aria-label": label,
    role: "status"
  }, rest), /*#__PURE__*/React.createElement("span", {
    className: "mws-thinking",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("span", null), /*#__PURE__*/React.createElement("span", null), /*#__PURE__*/React.createElement("span", null)));
}
Object.assign(__ds_scope, { ThinkingDots });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/ai/ThinkingDots.jsx", error: String((e && e.message) || e) }); }

// components/ai/ToolCallRow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Tool call row — icon + tool name + one-line summary + status. Click to expand. */
function ToolCallRow({
  icon = 'wrench',
  name,
  summary,
  status = 'Done',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: "mws-toolcall"
  }, rest), /*#__PURE__*/React.createElement("i", {
    className: `ph ph-${icon}`,
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("span", {
    className: "mws-toolcall__name"
  }, name), /*#__PURE__*/React.createElement("span", {
    className: "mws-toolcall__summary"
  }, summary), /*#__PURE__*/React.createElement("span", {
    className: "mws-toolcall__status"
  }, status));
}
Object.assign(__ds_scope, { ToolCallRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/ai/ToolCallRow.jsx", error: String((e && e.message) || e) }); }

// components/brand/Lockup.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SYMBOL = /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 171.84 171.84",
  xmlns: "http://www.w3.org/2000/svg",
  fill: "currentColor",
  role: "img",
  "aria-label": "McDermott"
}, /*#__PURE__*/React.createElement("path", {
  d: "M43,85.12l22.6,36.87h-22.6v-36.87ZM113.34,121.9h16.81V47.95h-16.81v73.95ZM42.17,47.95l47.09,76.79,8.38-20.04-34.79-56.75h-20.67ZM171.84,85.92c0,47.37-38.55,85.92-85.92,85.92S0,133.29,0,85.92,38.55,0,85.92,0s85.92,38.55,85.92,85.92ZM162.77,85.92c0-42.37-34.47-76.85-76.85-76.85S9.07,43.55,9.07,85.92s34.47,76.85,76.85,76.85,76.85-34.47,76.85-76.85Z"
}));

/**
 * McDermott application lockup — symbol + divider + app name.
 * Never render the firm name in type; never omit the divider in UI.
 *
 * `size` sets the symbol box (32 for header/topbar, 48–64 for login).
 * `symbolOnly` collapses to just the mark (use in ≤360px or 72px sidebar).
 * `variant` sets the color context — 'light' (currentColor from surface),
 * 'onNavy' forces white.
 */
function Lockup({
  name,
  size = 32,
  symbolOnly = false,
  variant = 'light',
  as: Tag = 'span',
  className = '',
  style,
  ...rest
}) {
  const nameSize = size <= 32 ? 18 : Math.round(size * 0.5);
  const color = variant === 'onNavy' ? 'var(--color-white)' : 'var(--text-primary)';
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: ['mws-lockup', className].filter(Boolean).join(' '),
    style: {
      color,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    className: "mws-lockup__symbol",
    style: {
      width: size,
      height: size
    }
  }, SYMBOL), !symbolOnly && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    className: "mws-lockup__divider",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("span", {
    className: "mws-lockup__name",
    style: {
      fontSize: nameSize
    }
  }, name)));
}
Object.assign(__ds_scope, { Lockup });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Lockup.jsx", error: String((e && e.message) || e) }); }

// components/buttons/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * McDermott primary/secondary/destructive button.
 *
 * ALL CAPS, 14pt sans, 2px radius, min 140×36, `white-space: nowrap`.
 * On hover:
 *   - Primary + Secondary FILL to the opposite color per theme.
 *   - Destructive darkens the red (no fill-flip).
 * Focus ring is 2px focus-ring, 3px offset.
 * Icons inside are locked to 16px.
 */
function Button({
  variant = 'primary',
  size = 'md',
  as: Tag = 'button',
  icon,
  iconRight,
  loading = false,
  disabled = false,
  children,
  className = '',
  style,
  type,
  ...rest
}) {
  const isDestructive = variant === 'destructive';
  const cls = ['mws-btn', `mws-btn--${variant}`, `mws-btn--${size}`, loading && 'is-loading', className].filter(Boolean).join(' ');
  const buttonType = Tag === 'button' && !type ? 'button' : type;
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: cls,
    style: style,
    disabled: Tag === 'button' ? disabled || loading : undefined,
    "aria-busy": loading || undefined,
    type: buttonType
  }, rest), loading ? /*#__PURE__*/React.createElement("span", {
    className: "mws-btn__spinner",
    "aria-hidden": "true"
  }) : /*#__PURE__*/React.createElement(React.Fragment, null, icon && /*#__PURE__*/React.createElement("i", {
    className: `ph ph-${icon}`,
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("span", {
    className: "mws-btn__label"
  }, children), iconRight && /*#__PURE__*/React.createElement("i", {
    className: `ph ph-${iconRight}`,
    "aria-hidden": "true"
  })));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/Button.jsx", error: String((e && e.message) || e) }); }

// components/buttons/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Icon-only button. 36×36 (md) or 28×28 (sm). Requires aria-label.
 */
function IconButton({
  icon,
  variant = 'ghost',
  size = 'md',
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
  ...rest
}) {
  if (!ariaLabel) {
    // Icon-only buttons must be labelled.
    // eslint-disable-next-line no-console
    console.warn('IconButton requires an aria-label');
  }
  const cls = ['mws-iconbtn', `mws-iconbtn--${variant}`, `mws-iconbtn--${size}`, className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: cls,
    "aria-label": ariaLabel,
    disabled: disabled
  }, rest), /*#__PURE__*/React.createElement("i", {
    className: `ph ph-${icon}`,
    "aria-hidden": "true"
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/buttons/Link.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * McDermott link.
 *
 * Variants:
 *  - "cta": ALL CAPS 16pt sans-medium + trailing arrow. Default color = text-primary.
 *  - "hyperlink": underlined sans-light 18pt. Default navy/white.
 *  - "title": sans-light 18pt content title, no underline.
 *  - "nav": Georgia 16pt navigation link.
 *
 * All variants flip BOTH border and text to `--accent-interactive` on hover.
 */
function Link({
  variant = 'hyperlink',
  href = '#',
  children,
  className = '',
  ...rest
}) {
  const cls = ['mws-link', `mws-link--${variant}`, className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("a", _extends({
    className: cls,
    href: href
  }, rest), /*#__PURE__*/React.createElement("span", null, children), variant === 'cta' && /*#__PURE__*/React.createElement("i", {
    className: "ph ph-arrow-right",
    "aria-hidden": "true"
  }));
}
Object.assign(__ds_scope, { Link });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/Link.jsx", error: String((e && e.message) || e) }); }

// components/data/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card. Optional top stroke (any secondary color), optional image slot.
 * Anatomy: eyebrow + title + body. Border, not shadow, at rest.
 */
function Card({
  eyebrow,
  title,
  stroke,
  interactive = false,
  as: Tag = 'div',
  className = '',
  style,
  children,
  ...rest
}) {
  const cls = ['mws-card', interactive && 'mws-card--interactive', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: cls,
    style: style
  }, rest), stroke && /*#__PURE__*/React.createElement("div", {
    className: "mws-card__stroke",
    style: {
      background: stroke
    }
  }), eyebrow && /*#__PURE__*/React.createElement("div", {
    className: "mws-card__eyebrow"
  }, eyebrow), title && /*#__PURE__*/React.createElement("h3", {
    className: "mws-card__title"
  }, title), children && /*#__PURE__*/React.createElement("div", {
    className: "mws-card__body"
  }, children));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Card.jsx", error: String((e && e.message) || e) }); }

// components/data/InfoStepper.jsx
try { (() => {
/**
 * Info stepper — for calculation flows where each step surfaces a value.
 * `steps`: { name, value?, state? }.
 */
function InfoStepper({
  steps,
  currentIndex = 0,
  className = ''
}) {
  const resolved = steps.map((s, i) => ({
    ...s,
    state: s.state || (i < currentIndex ? 'completed' : i === currentIndex ? 'current' : 'not-started')
  }));
  return /*#__PURE__*/React.createElement("div", {
    className: ['mws-info-stepper', className].filter(Boolean).join(' ')
  }, resolved.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "mws-info-step",
    "data-state": s.state
  }, /*#__PURE__*/React.createElement("div", {
    className: "mws-info-step__eyebrow"
  }, "Step ", i + 1), /*#__PURE__*/React.createElement("div", {
    className: "mws-info-step__name"
  }, s.name), /*#__PURE__*/React.createElement("div", {
    className: "mws-info-step__value"
  }, s.value ?? '—'))));
}
Object.assign(__ds_scope, { InfoStepper });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/InfoStepper.jsx", error: String((e && e.message) || e) }); }

// components/data/KPICard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function KPICard({
  label,
  value,
  delta,
  deltaDir,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['mws-kpi', className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "mws-kpi__label"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "mws-kpi__value"
  }, value), delta && /*#__PURE__*/React.createElement("div", {
    className: `mws-kpi__delta ${deltaDir === 'down' ? 'mws-kpi__delta--down' : 'mws-kpi__delta--up'}`
  }, /*#__PURE__*/React.createElement("i", {
    className: `ph ph-${deltaDir === 'down' ? 'arrow-down' : 'arrow-up'}`,
    "aria-hidden": "true"
  }), " ", delta));
}
Object.assign(__ds_scope, { KPICard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/KPICard.jsx", error: String((e && e.message) || e) }); }

// components/data/Stepper.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Circle stepper. `steps` is an array of { label, state? }.
 * If a step has no state, its state is inferred from `currentIndex`:
 *  index < current  → completed
 *  index === current → current
 *  index > current  → not-started
 */
function Stepper({
  steps,
  currentIndex = 0,
  className = '',
  ...rest
}) {
  const resolved = steps.map((s, i) => {
    const state = s.state || (i < currentIndex ? 'completed' : i === currentIndex ? 'current' : 'not-started');
    return {
      ...s,
      state
    };
  });
  return /*#__PURE__*/React.createElement("ol", _extends({
    className: ['mws-stepper', className].filter(Boolean).join(' '),
    "aria-label": "Progress"
  }, rest), resolved.map((s, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, /*#__PURE__*/React.createElement("li", {
    className: "mws-step",
    "data-state": s.state,
    "aria-current": s.state === 'current' ? 'step' : undefined
  }, /*#__PURE__*/React.createElement("div", {
    className: "mws-step__circle",
    "aria-hidden": "true"
  }, s.state === 'completed' ? /*#__PURE__*/React.createElement("i", {
    className: "ph ph-check"
  }) : s.state === 'error' ? /*#__PURE__*/React.createElement("i", {
    className: "ph ph-warning"
  }) : i + 1), /*#__PURE__*/React.createElement("div", {
    className: "mws-step__label"
  }, s.label)), i < resolved.length - 1 && /*#__PURE__*/React.createElement("div", {
    className: "mws-step__connector",
    "data-done": resolved[i].state === 'completed' || undefined,
    "aria-hidden": "true"
  }))));
}
Object.assign(__ds_scope, { Stepper });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Stepper.jsx", error: String((e && e.message) || e) }); }

// components/data/Table.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Wraps a native <table>. Callers supply thead/tbody markup for full control.
 * The `min-width` on the inner table drives the horizontal-scroll behavior.
 */
function Table({
  toolbar,
  children,
  pagination,
  minWidth = 720,
  className = ''
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: ['mws-table-shell', className].filter(Boolean).join(' ')
  }, toolbar && /*#__PURE__*/React.createElement("div", {
    className: "mws-table__toolbar"
  }, toolbar), /*#__PURE__*/React.createElement("table", {
    className: "mws-table",
    style: {
      minWidth
    }
  }, children), pagination && /*#__PURE__*/React.createElement("div", {
    className: "mws-table__pagination"
  }, pagination));
}
function SortHeader({
  label,
  sort = 'none',
  onSort,
  className = '',
  ...rest
}) {
  const next = sort === 'ascending' ? 'descending' : sort === 'descending' ? 'none' : 'ascending';
  const caret = sort === 'ascending' ? 'caret-up' : sort === 'descending' ? 'caret-down' : 'dots-three-vertical';
  return /*#__PURE__*/React.createElement("th", _extends({
    className: className,
    "data-sortable": "true",
    "aria-sort": sort,
    onClick: onSort ? () => onSort(next) : undefined,
    style: {
      cursor: 'pointer'
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6
    }
  }, label, /*#__PURE__*/React.createElement("i", {
    className: `ph ph-${caret}`,
    style: {
      fontSize: 14,
      opacity: sort === 'none' ? 0.3 : 1
    },
    "aria-hidden": "true"
  })));
}
Object.assign(__ds_scope, { Table, SortHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Table.jsx", error: String((e && e.message) || e) }); }

// components/disclosure/Accordion.jsx
try { (() => {
function Accordion({
  items,
  className = ''
}) {
  const [open, setOpen] = React.useState({});
  return /*#__PURE__*/React.createElement("div", {
    className: ['mws-accordion', className].filter(Boolean).join(' ')
  }, items.map((it, i) => {
    const isOpen = !!open[i];
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      className: "mws-accordion__item",
      "data-open": isOpen || undefined
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      className: "mws-accordion__trigger",
      "aria-expanded": isOpen,
      onClick: () => setOpen(s => ({
        ...s,
        [i]: !s[i]
      }))
    }, /*#__PURE__*/React.createElement("span", null, it.title), /*#__PURE__*/React.createElement("i", {
      className: "ph ph-caret-down",
      "aria-hidden": "true"
    })), isOpen && /*#__PURE__*/React.createElement("div", {
      className: "mws-accordion__panel"
    }, it.body));
  }));
}
Object.assign(__ds_scope, { Accordion });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/disclosure/Accordion.jsx", error: String((e && e.message) || e) }); }

// components/disclosure/Modal.jsx
try { (() => {
/**
 * Blocking modal. Traps focus, closes on Escape.
 * Consumers control open/close via `open`.
 */
function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  closeLabel = 'Close',
  className = ''
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = e => {
      if (e.key === 'Escape') onClose && onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "mws-scrim",
    onClick: onClose,
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-modal": "true",
    "aria-label": typeof title === 'string' ? title : undefined,
    className: ['mws-modal', className].filter(Boolean).join(' ')
  }, title && /*#__PURE__*/React.createElement("div", {
    className: "mws-modal__header"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "mws-modal__title"
  }, title), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "mws-iconbtn",
    "aria-label": closeLabel,
    onClick: onClose
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph ph-x",
    "aria-hidden": "true"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mws-modal__body"
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    className: "mws-modal__footer"
  }, footer)));
}
Object.assign(__ds_scope, { Modal });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/disclosure/Modal.jsx", error: String((e && e.message) || e) }); }

// components/disclosure/Popover.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Popover menu shell — position it via wrapper style. */
function Popover({
  open,
  children,
  className = '',
  style,
  ...rest
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "menu",
    className: ['mws-popover', className].filter(Boolean).join(' '),
    style: style
  }, rest), children);
}
function PopoverItem({
  icon,
  destructive = false,
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    role: "menuitem",
    type: "button",
    className: ['mws-popover__item', destructive && 'mws-popover__item--destructive'].filter(Boolean).join(' ')
  }, rest), icon && /*#__PURE__*/React.createElement("i", {
    className: `ph ph-${icon}`,
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("span", null, children));
}
function PopoverDivider() {
  return /*#__PURE__*/React.createElement("div", {
    className: "mws-popover__divider",
    role: "separator"
  });
}
Object.assign(__ds_scope, { Popover, PopoverItem, PopoverDivider });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/disclosure/Popover.jsx", error: String((e && e.message) || e) }); }

// components/disclosure/SideSheet.jsx
try { (() => {
/**
 * Non-blocking side sheet, right-anchored. Table row detail lives here.
 */
function SideSheet({
  open,
  onClose,
  title,
  children,
  footer,
  className = ''
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = e => {
      if (e.key === 'Escape') onClose && onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-label": typeof title === 'string' ? title : undefined,
    className: ['mws-sheet', className].filter(Boolean).join(' ')
  }, /*#__PURE__*/React.createElement("div", {
    className: "mws-sheet__header"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "mws-sheet__title"
  }, title), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "mws-iconbtn",
    "aria-label": "Close",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph ph-x",
    "aria-hidden": "true"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mws-sheet__body"
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    className: "mws-sheet__footer"
  }, footer));
}
Object.assign(__ds_scope, { SideSheet });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/disclosure/SideSheet.jsx", error: String((e && e.message) || e) }); }

// components/disclosure/Tabs.jsx
try { (() => {
/**
 * Horizontal scrolling tab row. Never wraps.
 * `tabs`: [{ id, label }]. `value` and `onChange` are controlled.
 */
function Tabs({
  tabs,
  value,
  onChange,
  className = ''
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: "tablist",
    className: ['mws-tabs', className].filter(Boolean).join(' ')
  }, tabs.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    role: "tab",
    type: "button",
    className: "mws-tab",
    "aria-selected": value === t.id,
    tabIndex: value === t.id ? 0 : -1,
    onClick: () => onChange && onChange(t.id)
  }, t.label)));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/disclosure/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Alert.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const ICONS = {
  info: 'info',
  success: 'check-circle',
  warning: 'warning-circle',
  error: 'x-circle'
};
function Alert({
  severity = 'info',
  title,
  children,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "alert",
    className: ['mws-alert', `mws-alert--${severity}`, className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement("i", {
    className: `ph ph-${ICONS[severity]}`,
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    className: "mws-alert__title"
  }, title), /*#__PURE__*/React.createElement("div", null, children)));
}
Object.assign(__ds_scope, { Alert });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Alert.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Status pill. Default: pale fills with navy text; never saturated alerts as text color.
 */
function Badge({
  status = 'live',
  children,
  className = '',
  ...rest
}) {
  const cls = ['mws-badge', `mws-badge--${status}`, className].filter(Boolean).join(' ');
  const withDot = status === 'live' || status === 'pending' || status === 'failed';
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls
  }, rest), withDot && /*#__PURE__*/React.createElement("span", {
    className: "mws-badge__dot",
    "aria-hidden": "true"
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Badge.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
/**
 * Three flavors:
 *  - "zero-data" (first run): pale background + large icon + primary CTA
 *  - "filtered": bg-surface + border + no illustration + secondary CTA ("Clear filters")
 *  - "no-access": explanation + optional CTA
 */
function EmptyState({
  variant = 'zero-data',
  icon = 'folder-simple',
  title,
  children,
  action,
  className = ''
}) {
  const cls = variant === 'filtered' ? 'mws-empty--filtered' : 'mws-empty--zero';
  return /*#__PURE__*/React.createElement("div", {
    className: ['mws-empty', cls, className].filter(Boolean).join(' ')
  }, variant !== 'filtered' && /*#__PURE__*/React.createElement("i", {
    className: `ph ph-${icon} mws-empty__icon`,
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("div", {
    className: "mws-empty__title"
  }, title), children && /*#__PURE__*/React.createElement("div", {
    className: "mws-empty__body"
  }, children), action);
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Skeleton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Text or block skeleton. Set width/height via style. */
function Skeleton({
  width,
  height = 12,
  radius = 'var(--radius)',
  className = '',
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    "aria-hidden": "true",
    className: ['mws-skel', className].filter(Boolean).join(' '),
    style: {
      width,
      height,
      borderRadius: radius,
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Skeleton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Skeleton.jsx", error: String((e && e.message) || e) }); }

// components/feedback/StatusIndicator.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Autosave / sync / version status. Icon-only on narrow viewports (host chooses when to hide label). */
function StatusIndicator({
  state = 'saved',
  label,
  showLabel = true,
  ...rest
}) {
  const ICONS = {
    saved: 'cloud-check',
    syncing: 'arrows-clockwise',
    unsaved: 'circle-dashed',
    error: 'warning-circle',
    readonly: 'lock'
  };
  const cls = ['mws-status', state === 'error' && 'mws-status--error', state === 'syncing' && 'mws-status--syncing'].filter(Boolean).join(' ');
  const defaultLabel = {
    saved: 'Saved',
    syncing: 'Syncing…',
    unsaved: 'Unsaved',
    error: 'Sync error',
    readonly: 'Read-only'
  }[state];
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls,
    "aria-label": label || defaultLabel,
    title: label || defaultLabel
  }, rest), /*#__PURE__*/React.createElement("i", {
    className: `ph ph-${ICONS[state]}`,
    "aria-hidden": "true"
  }), showLabel && /*#__PURE__*/React.createElement("span", null, label || defaultLabel));
}
Object.assign(__ds_scope, { StatusIndicator });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/StatusIndicator.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Toast — bottom-right stack, max 3 visible. Errors never auto-dismiss.
 * This is the leaf visual; hosts manage the queue.
 */
function Toast({
  severity = 'info',
  title,
  children,
  onClose,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "status",
    className: ['mws-toast', `mws-toast--${severity}`, className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      marginBottom: 2
    }
  }, title), children && /*#__PURE__*/React.createElement("div", null, children)), onClose && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClose,
    "aria-label": "Dismiss",
    className: "mws-iconbtn mws-iconbtn--sm"
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph ph-x",
    "aria-hidden": "true"
  })));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Checkbox({
  label,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: ['mws-check', className].filter(Boolean).join(' ')
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox"
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "mws-check__box"
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph ph-check",
    "aria-hidden": "true"
  })), label && /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Field.jsx
try { (() => {
/** Field wrapper — label (with optional flag), hint, error, control. */
function Field({
  id,
  label,
  optional = false,
  hint,
  error,
  htmlFor,
  children,
  className = ''
}) {
  const forId = htmlFor || id;
  return /*#__PURE__*/React.createElement("div", {
    className: ['mws-field', className].filter(Boolean).join(' ')
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "mws-field__label",
    htmlFor: forId
  }, label, optional && /*#__PURE__*/React.createElement("span", {
    className: "mws-field__optional"
  }, "(Optional)")), children, hint && !error && /*#__PURE__*/React.createElement("div", {
    className: "mws-field__hint"
  }, hint), error && /*#__PURE__*/React.createElement("div", {
    className: "mws-field__error",
    role: "alert"
  }, error));
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Field.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input({
  compact = false,
  invalid = false,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("input", _extends({
    className: ['mws-input', compact && 'mws-input--compact', className].filter(Boolean).join(' '),
    "aria-invalid": invalid || undefined
  }, rest));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Radio({
  label,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: ['mws-radio', className].filter(Boolean).join(' ')
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "radio"
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "mws-radio__box"
  }), label && /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Native <select> styled to McDermott. Pass `options` or children. */
function Select({
  options,
  children,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("select", _extends({
    className: ['mws-select', className].filter(Boolean).join(' ')
  }, rest), options ? options.map(o => typeof o === 'string' ? /*#__PURE__*/React.createElement("option", {
    key: o,
    value: o
  }, o) : /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value,
    disabled: o.disabled
  }, o.label)) : children);
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Switch({
  label,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: ['mws-switch', className].filter(Boolean).join(' ')
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    role: "switch"
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "mws-switch__track"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mws-switch__thumb"
  })), label && /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Textarea({
  invalid = false,
  className = '',
  rows = 4,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("textarea", _extends({
    className: ['mws-textarea', className].filter(Boolean).join(' '),
    rows: rows,
    "aria-invalid": invalid || undefined
  }, rest));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/nav/Breadcrumb.jsx
try { (() => {
function Breadcrumb({
  items,
  className = ''
}) {
  return /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Breadcrumb",
    className: ['mws-crumbs', className].filter(Boolean).join(' ')
  }, items.map((it, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, it.href && i !== items.length - 1 ? /*#__PURE__*/React.createElement("a", {
    href: it.href,
    className: "mws-crumbs__item"
  }, it.label) : /*#__PURE__*/React.createElement("span", {
    className: "mws-crumbs__item",
    "aria-current": i === items.length - 1 ? 'page' : undefined
  }, it.label), i < items.length - 1 && /*#__PURE__*/React.createElement("i", {
    className: "ph ph-caret-right mws-crumbs__sep",
    "aria-hidden": "true"
  }))));
}
Object.assign(__ds_scope, { Breadcrumb });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/nav/Breadcrumb.jsx", error: String((e && e.message) || e) }); }

// components/nav/IdentifierBadge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Small pill for matter IDs / project codes — monospace, pale bg, 1px border. */
function IdentifierBadge({
  children,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: ['mws-ident', className].filter(Boolean).join(' ')
  }, rest), children);
}
Object.assign(__ds_scope, { IdentifierBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/nav/IdentifierBadge.jsx", error: String((e && e.message) || e) }); }

// components/nav/NavItem.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * A single sidebar/nav row. One leading marker per item — pass either `icon`
 * OR `number`, never both.
 */
function NavItem({
  icon,
  number,
  children,
  active = false,
  href = '#',
  as: Tag = 'a',
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement(Tag, _extends({
    href: Tag === 'a' ? href : undefined,
    className: ['mws-nav-item', className].filter(Boolean).join(' '),
    "aria-current": active ? 'page' : undefined
  }, rest), number != null && /*#__PURE__*/React.createElement("span", {
    className: "mws-nav-item__num",
    "aria-hidden": "true"
  }, number), icon && number == null && /*#__PURE__*/React.createElement("i", {
    className: `ph ph-${icon}`,
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("span", null, children));
}
Object.assign(__ds_scope, { NavItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/nav/NavItem.jsx", error: String((e && e.message) || e) }); }

// components/nav/Sidebar.jsx
try { (() => {
/**
 * Sidebar shell. Manages open/close on mobile as a drawer.
 * `header` = app lockup / matter card. `pinned` = bottom user/account slot.
 */
function Sidebar({
  header,
  sectionLabel,
  children,
  pinned,
  open = false,
  onClose,
  className = ''
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "mws-drawer-scrim",
    "data-open": open || undefined,
    onClick: onClose,
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("aside", {
    className: ['mws-sidebar', className].filter(Boolean).join(' '),
    "data-open": open || undefined,
    "aria-label": "Application navigation"
  }, header && /*#__PURE__*/React.createElement("div", {
    className: "mws-sidebar__header"
  }, header), /*#__PURE__*/React.createElement("div", {
    className: "mws-sidebar__primary"
  }, sectionLabel && /*#__PURE__*/React.createElement("div", {
    className: "mws-sidebar__section-label"
  }, sectionLabel), /*#__PURE__*/React.createElement("nav", null, children)), pinned && /*#__PURE__*/React.createElement("div", {
    className: "mws-sidebar__pinned"
  }, pinned)));
}
Object.assign(__ds_scope, { Sidebar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/nav/Sidebar.jsx", error: String((e && e.message) || e) }); }

// components/nav/TopBar.jsx
try { (() => {
/**
 * Sticky top bar. Left slot for hamburger + breadcrumb/title;
 * right slot for status + primary action + account.
 */
function TopBar({
  left,
  title,
  right,
  className = ''
}) {
  return /*#__PURE__*/React.createElement("header", {
    className: ['mws-topbar', className].filter(Boolean).join(' ')
  }, /*#__PURE__*/React.createElement("div", {
    className: "mws-topbar__left"
  }, left, title && /*#__PURE__*/React.createElement("div", {
    className: "mws-topbar__title"
  }, title)), /*#__PURE__*/React.createElement("div", {
    className: "mws-topbar__right"
  }, right));
}
Object.assign(__ds_scope, { TopBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/nav/TopBar.jsx", error: String((e && e.message) || e) }); }

__ds_ns.PermissionPrompt = __ds_scope.PermissionPrompt;

__ds_ns.PromptChip = __ds_scope.PromptChip;

__ds_ns.SparkleLabel = __ds_scope.SparkleLabel;

__ds_ns.ThinkingDots = __ds_scope.ThinkingDots;

__ds_ns.ToolCallRow = __ds_scope.ToolCallRow;

__ds_ns.Lockup = __ds_scope.Lockup;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Link = __ds_scope.Link;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.InfoStepper = __ds_scope.InfoStepper;

__ds_ns.KPICard = __ds_scope.KPICard;

__ds_ns.Stepper = __ds_scope.Stepper;

__ds_ns.Table = __ds_scope.Table;

__ds_ns.SortHeader = __ds_scope.SortHeader;

__ds_ns.Accordion = __ds_scope.Accordion;

__ds_ns.Modal = __ds_scope.Modal;

__ds_ns.Popover = __ds_scope.Popover;

__ds_ns.PopoverItem = __ds_scope.PopoverItem;

__ds_ns.PopoverDivider = __ds_scope.PopoverDivider;

__ds_ns.SideSheet = __ds_scope.SideSheet;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.Alert = __ds_scope.Alert;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Skeleton = __ds_scope.Skeleton;

__ds_ns.StatusIndicator = __ds_scope.StatusIndicator;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.Breadcrumb = __ds_scope.Breadcrumb;

__ds_ns.IdentifierBadge = __ds_scope.IdentifierBadge;

__ds_ns.NavItem = __ds_scope.NavItem;

__ds_ns.Sidebar = __ds_scope.Sidebar;

__ds_ns.TopBar = __ds_scope.TopBar;

})();
