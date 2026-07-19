// Shared side-sheet primitive (disclosure-surfaces.md side-sheet pattern). A right-anchored panel
// that slides in over content for secondary detail the user references alongside the main view — the
// S43 Toolkit detail + editor. Non-blocking by intent, but keyboard-safe: focus moves in on open and
// restores to the trigger on unmount; Escape, the close button, and a scrim click all dismiss
// (accessibility.md). The parent renders it only while open, so mount == open. `data-ds="sheet"` is
// the design-fidelity handle.

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from '@phosphor-icons/react';

import './SideSheet.css';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface SideSheetProps {
  /** Sentence-case headline (ux-copy-and-microcopy.md). Rendered as the dialog's accessible name. */
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function SideSheet({ title, onClose, children }: SideSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- scrim: mousedown-to-close is a convenience; Escape and the in-sheet controls are the accessible affordances.
    <div className="mws-sheet-scrim" onMouseDown={onClose}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the panel swallows mousedown so an in-sheet drag doesn't bubble to the scrim and close it; not a user-facing interaction. */}
      <div
        className="mws-sheet"
        data-ds="sheet"
        role="dialog"
        aria-labelledby={titleId}
        ref={dialogRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mws-sheet__header">
          <h2 id={titleId} className="mws-sheet__title">
            {title}
          </h2>
          <button type="button" className="mws-sheet__close" aria-label="Close" onClick={onClose}>
            <X size={18} weight="regular" aria-hidden />
          </button>
        </div>
        <div className="mws-sheet__body">{children}</div>
      </div>
    </div>
  );
}
