// Relationships card (S4/S5 side panel, rendered in the Status tab of the as-built record detail —
// BS §2.2). Lists the record's outgoing typed links with cross-navigation, a remove action, and the
// "Link a record" + "Copy record" affordances. Renders explicit loading / error / empty states
// (web-component-architecture.md).

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowSquareOut, Copy, Plus, X } from '@phosphor-icons/react';

import type { RecordId, TypedLinkId, WorkspaceId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { problemMessage } from '@/shared/http/problemMessage';

import { CopyModal } from './CopyModal';
import { LinkRecordModal } from './LinkRecordModal';
import { LINK_KIND_LABELS } from './linkKinds';
import { useDeleteLink, useRecordLinks } from './useTypedLinks';
import './typedLinks.css';

interface RelationshipsCardProps {
  recordId: RecordId;
  workspaceId: WorkspaceId;
}

export function RelationshipsCard({ recordId, workspaceId }: RelationshipsCardProps) {
  const navigate = useNavigate();
  const { data: links, isLoading, isError, error } = useRecordLinks(recordId);
  const deleteLink = useDeleteLink(recordId);
  const [linkOpen, setLinkOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);

  const remove = (linkId: TypedLinkId) => deleteLink.mutate(linkId);

  return (
    <section className="record-card" aria-label="Relationships">
      <span className="record-chip">Relationships</span>

      {isLoading && (
        <p className="caption" role="status">
          Loading linked records…
        </p>
      )}

      {isError && (
        <p className="mws-alert mws-alert--warning" role="status">
          {problemMessage(error, 'Linked records couldn’t be loaded. Try again in a moment.')}
        </p>
      )}

      {!isLoading && !isError && (links?.length ?? 0) === 0 && (
        <p className="caption">No linked records yet.</p>
      )}

      {!isLoading && !isError && (links?.length ?? 0) > 0 && (
        <ul className="typed-links__list">
          {links!.map((link) => (
            <li key={link.id} className="typed-links__item">
              <span className="typed-links__kind">{LINK_KIND_LABELS[link.kind]}</span>
              <button
                type="button"
                className="typed-links__target"
                onClick={() => navigate(`/requests/${link.toRecordId}`)}
              >
                <span className="typed-links__id">{link.toRecordId}</span>
                {link.toName && <span className="typed-links__name">{link.toName}</span>}
                <ArrowSquareOut size={14} aria-hidden />
              </button>
              <button
                type="button"
                className="typed-links__remove"
                aria-label={`Remove link to ${link.toRecordId}`}
                onClick={() => remove(link.id)}
                disabled={deleteLink.isPending}
              >
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {deleteLink.isError && (
        <p className="mws-alert mws-alert--warning" role="status">
          {problemMessage(deleteLink.error, 'The link couldn’t be removed. Try again in a moment.')}
        </p>
      )}

      <div className="typed-links__actions">
        <Button variant="secondary" onClick={() => setLinkOpen(true)}>
          <Plus size={16} aria-hidden />
          Link a record
        </Button>
        <Button variant="secondary" onClick={() => setCopyOpen(true)}>
          <Copy size={16} aria-hidden />
          Copy record
        </Button>
      </div>

      {linkOpen && <LinkRecordModal recordId={recordId} onClose={() => setLinkOpen(false)} />}
      {copyOpen && (
        <CopyModal recordId={recordId} currentWorkspaceId={workspaceId} onClose={() => setCopyOpen(false)} />
      )}
    </section>
  );
}
