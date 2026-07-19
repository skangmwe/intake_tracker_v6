// The side-sheet chrome shared by the composer's two sheets (New dashboard, Widget editor) — slice 28.
// Slides in from the right over content (disclosure-surfaces.md); focus is trapped, Escape / scrim /
// close dismiss, and focus returns to the opener on unmount (accessibility.md). Body + footer are
// supplied by the caller.

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from '@phosphor-icons/react';

import { IconButton } from '@/shared/components/Button';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface ComposerSheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}

export function ComposerSheet({ title, onClose, children, footer }: ComposerSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const sheet = sheetRef.current;
    sheet?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !sheet) return;
      const focusable = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => !element.hasAttribute('disabled'),
      );
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
      opener?.focus?.();
    };
  }, [onClose]);

  const titleId = 'composer-sheet-title';

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- scrim mousedown-to-close is a convenience; Escape and the in-sheet controls are the accessible affordances.
    <div className="dash-sheet-overlay" onMouseDown={onClose}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the sheet swallows mousedown so an in-sheet drag doesn't bubble to the scrim and close it; not a user-facing interaction. */}
      <div
        ref={sheetRef}
        className="dash-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-ds="side-sheet"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dash-sheet__header">
          <h2 id={titleId} className="dash-sheet__title">
            {title}
          </h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </header>
        <div className="dash-sheet__body">{children}</div>
        <footer className="dash-sheet__footer">{footer}</footer>
      </div>
    </div>
  );
}
