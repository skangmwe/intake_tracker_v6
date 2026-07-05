// Shared modal primitive (disclosure-surfaces.md modal pattern). Centered, focus-trapped, scrim;
// Escape + scrim-click close; focus restores to the trigger on unmount (accessibility.md). The parent
// renders it only while open, so mount == open. `data-ds="modal"` is the design-fidelity handle.
// Extracted in slice 10 once close / copy / link-a-record joined escalate as modal consumers.

import { useEffect, useId, useRef, type ReactNode } from 'react';

import './Modal.css';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  /** Sentence-case headline (ux-copy-and-microcopy.md). Rendered as the dialog's accessible name. */
  title: string;
  onClose: () => void;
  /** Body content above the action row. */
  children: ReactNode;
  /** The action row — verb+noun buttons; the primitive wraps them so they flex-wrap at narrow widths. */
  footer: ReactNode;
}

export function Modal({ title, onClose, children, footer }: ModalProps) {
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
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (!firstEl || !lastEl) return;
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div className="mws-modal-scrim" onMouseDown={onClose}>
      <div
        className="mws-modal"
        data-ds="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="mws-modal__title">
          {title}
        </h2>
        <div className="mws-modal__body">{children}</div>
        <div className="mws-modal__actions">{footer}</div>
      </div>
    </div>
  );
}
