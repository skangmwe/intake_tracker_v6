// S23 archive confirmation (disclosure-surfaces.md modal — a consequential action confirmed before it
// runs). Names the specific announcement (ux-copy-and-microcopy.md). Archiving removes it from the bell
// and Home and freezes it from edits; it is not a delete, but it can't be undone from the UI, so it is
// confirmed. Reuses the existing retire path (usp_RetireAnnouncement sets Status → Archived) via
// useRetireAnnouncement. Renders nothing until an announcement is targeted. A failure renders inline.

import type { WorkspaceId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Disclosure';
import { problemMessage } from '@/shared/http/problemMessage';

import { useRetireAnnouncement } from '../useAnnouncements';

interface ArchiveAnnouncementDialogProps {
  /** The announcement to archive, or null when the dialog is closed. */
  announcement: { id: string; title: string } | null;
  workspaceId: WorkspaceId;
  onClose: () => void;
}

export function ArchiveAnnouncementDialog({
  announcement,
  workspaceId,
  onClose,
}: ArchiveAnnouncementDialogProps) {
  const retire = useRetireAnnouncement(workspaceId);

  if (!announcement) return null;

  const cancel = () => {
    retire.reset();
    onClose();
  };
  const confirm = () =>
    retire.mutate(announcement.id, {
      onSuccess: () => {
        retire.reset();
        onClose();
      },
    });

  return (
    <Modal
      title="Archive this announcement?"
      onClose={cancel}
      footer={
        <>
          <Button variant="secondary" onClick={cancel} disabled={retire.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={retire.isPending}>
            {retire.isPending ? 'Archiving…' : 'Archive announcement'}
          </Button>
        </>
      }
    >
      <p>
        This removes <strong>{announcement.title}</strong> from everyone&rsquo;s bell and the Home
        strip, and freezes it from further edits. It stays on the record. This can&rsquo;t be
        undone.
      </p>
      {retire.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          {problemMessage(retire.error)}
        </p>
      )}
    </Modal>
  );
}
