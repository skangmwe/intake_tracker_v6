// "Pin as home" affordance on the S6 dashboard heading (prototype toggleDashPin). Home is the R1
// landing surface, so this is a local presentation toggle with no persistence endpoint — the prototype
// renders no such action, and the design-code handoff rule forbids inventing one. Accent when pinned,
// secondary otherwise; aria-pressed and the label both reflect the state.

import { useState } from 'react';
import { PushPin } from '@phosphor-icons/react';

export function DashPinButton() {
  const [pinned, setPinned] = useState(false);
  const label = pinned
    ? 'This dashboard is your default landing surface'
    : 'Set as default landing surface';

  return (
    <button
      type="button"
      className={`dash__pin${pinned ? ' dash__pin--active' : ''}`}
      aria-pressed={pinned}
      aria-label={label}
      title={label}
      onClick={() => setPinned((prev) => !prev)}
    >
      <PushPin size={20} weight="regular" aria-hidden="true" />
    </button>
  );
}
