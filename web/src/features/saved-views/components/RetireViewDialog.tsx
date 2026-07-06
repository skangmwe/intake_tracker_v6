// S32 retire confirmation (disclosure-surfaces.md modal — a destructive action confirmed before it
// runs). Names the specific view (ux-copy-and-microcopy.md). Retiring a view soft-deletes it and never
// touches any records (BS §22.4). A failure renders inline so the admin sees why.

import type { SavedViewDto } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Disclosure';
import { problemMessage } from '@/shared/http/problemMessage';

interface RetireViewDialogProps {
  view: SavedViewDto;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
  error: unknown;
}

export function RetireViewDialog({ view, onConfirm, onCancel, isPending, error }: RetireViewDialogProps) {
  return (
    <Modal
      title="Retire this view?"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Retiring…' : `Retire ${view.name}`}
          </Button>
        </>
      }
    >
      <p>
        This removes <strong>{view.name}</strong> from the {view.scope === 'shared' ? 'shared' : 'personal'}{' '}
        view list. It does not change or delete any records. This can&rsquo;t be undone.
      </p>
      {error != null && (
        <p className="mws-alert mws-alert--error views-admin__dialog-error" role="alert">
          {problemMessage(error)}
        </p>
      )}
    </Modal>
  );
}
