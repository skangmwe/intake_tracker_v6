// S18 Escalate modal — confirm-and-lock at the moment of escalation (BS §6.3, disclosure-surfaces.md
// modal pattern). Centered, focus-trapped, scrim; Escape and scrim-click close. Confirming sends
// confirmPendingEdits=true (the "commit pending edits" acknowledgement — the API can't see unsaved
// client edits) and, on success, the parent's record query refetches into the escalated variant.
// The parent renders this only while open, so mount == open (keeps focus management simple).

import { useEffect, useId, useRef } from 'react';
import { ArrowsLeftRight } from '@phosphor-icons/react';

import type { RecordId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { problemMessage } from '@/shared/http/problemMessage';

import { useEscalate } from './useEscalate';
import './escalate.css';

interface EscalateModalProps {
  recordId: RecordId;
  recordName: string;
  onClose: () => void;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function EscalateModal({ recordId, recordName, onClose }: EscalateModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const escalate = useEscalate(recordId);

  // Focus management + trap. Restore focus to the trigger on close (accessibility.md).
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

  const onConfirm = () => {
    escalate.mutate(
      { confirmPendingEdits: true },
      { onSuccess: () => onClose() },
    );
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- scrim: mousedown-to-close is a convenience; Escape and the in-dialog controls are the accessible affordances.
    <div className="escalate-scrim" onMouseDown={onClose}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the dialog swallows mousedown so an in-dialog drag doesn't bubble to the scrim and close it; not a user-facing interaction. */}
      <div
        className="escalate-modal"
        data-ds="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        ref={dialogRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="escalate-modal__title">
          Escalate this request to AI Solutions?
        </h2>
        <p id={bodyId} className="escalate-modal__body">
          The AI Solutions team receives “{recordName}” as a new record that shares this record’s ID.
          Its crossing fields lock on this side and track AI-side delivery through the AI Solutions
          Status mirror from here on. This can’t be undone.
        </p>
        <p className="escalate-modal__note">
          <ArrowsLeftRight size={16} weight="regular" aria-hidden />
          Commit any pending edits to the crossing fields first — nothing is discarded.
        </p>

        {escalate.isError && (
          <p className="mws-alert mws-alert--error" role="alert">
            {problemMessage(escalate.error, 'The record could not be escalated. Try again in a moment.')}
          </p>
        )}

        <div className="escalate-modal__actions">
          <Button variant="secondary" onClick={onClose} disabled={escalate.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={escalate.isPending}>
            {escalate.isPending ? 'Escalating…' : 'Escalate to AI Solutions'}
          </Button>
        </div>
      </div>
    </div>
  );
}
