// "Pin as home" affordance next to the Home heading (S1). Home is the only landing surface in R1, so
// this is a static pressed indicator (the prototype's control is a no-op): it communicates that Home
// is the caller's default landing surface. No persistence endpoint is invented — the prototype renders
// no such action, and the design-code handoff rule forbids adding what the prototype does not show.

import { PushPin } from '@phosphor-icons/react';

export function PinAsHomeButton() {
  return (
    <button
      type="button"
      className="home__pin"
      aria-pressed="true"
      aria-label="Home is your default landing surface"
      title="Home is your default landing surface"
    >
      <PushPin size={20} weight="regular" aria-hidden="true" />
    </button>
  );
}
