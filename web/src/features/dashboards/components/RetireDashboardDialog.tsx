// S32 retire confirmation — a destructive action confirmed before it runs (disclosure-surfaces.md
// modal). Names the specific dashboard (ux-copy-and-microcopy.md). Retiring soft-deletes the dashboard
// and never touches any records. A failure renders inline so the admin sees why.

import type { DashboardListItemDto } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Disclosure';
import { problemMessage } from '@/shared/http/problemMessage';

interface RetireDashboardDialogProps {
  dashboard: DashboardListItemDto;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
  error: unknown;
}

export function RetireDashboardDialog({
  dashboard,
  onConfirm,
  onCancel,
  isPending,
  error,
}: RetireDashboardDialogProps) {
  return (
    <Modal
      title="Retire this dashboard?"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Retiring…' : `Retire ${dashboard.name}`}
          </Button>
        </>
      }
    >
      <p>
        This removes <strong>{dashboard.name}</strong> from the workspace&rsquo;s dashboards. It does not
        change or delete any records. This can&rsquo;t be undone.
      </p>
      {error != null && (
        <p className="mws-alert mws-alert--error dash-admin__error" role="alert">
          {problemMessage(error)}
        </p>
      )}
    </Modal>
  );
}
