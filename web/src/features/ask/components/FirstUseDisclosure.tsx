// First-use disclosure banner (Phase 4, ai-trust-and-provenance.md). A dismissible note — never a modal —
// that the answers are AI-generated, may be wrong, and should be verified against the cited records.
// Dismissal is session-scoped (web-persistence.md reserves localStorage for the theme only).

import { useState } from 'react';
import { Sparkle, X } from '@phosphor-icons/react';

export function FirstUseDisclosure() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="ask-disclosure" role="note">
      <Sparkle size={16} weight="regular" aria-hidden />
      <p className="ask-disclosure__text">
        Answers are AI-generated from this workspace’s requests. They can be wrong — verify each claim against
        the cited records before relying on it.
      </p>
      <button
        type="button"
        className="ask-disclosure__dismiss"
        aria-label="Dismiss AI notice"
        onClick={() => setDismissed(true)}
      >
        <X size={16} weight="regular" aria-hidden />
      </button>
    </div>
  );
}
