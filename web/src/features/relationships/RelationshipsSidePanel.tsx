// RelationshipsSidePanel — the S4/S5 side-panel Relationships block (Slice 25). One
// section per relationship defined for the record's FromObjectType, with a count and a
// (deferred) "Link a record" affordance. Uses the shared card styles from the design system.
//
// Consumers: features/requests/RecordDetailPage. Stateless — reads relationships via
// useRelationshipTabs and links per section via fetchRelationshipLinks lazily.

import { useEffect, useState } from 'react';

import type {
  FieldObjectType,
  RecordId,
  RelationshipDto,
  RelationshipLinkDto,
  WorkspaceId,
} from '@shared/types';

import { fetchRelationshipLinks } from './api';
import { useRelationshipTabs } from './useRelationshipTabs';

export interface RelationshipsSidePanelProps {
  workspaceId: WorkspaceId | null;
  recordId: RecordId | null;
  fromObjectType: FieldObjectType | null;
}

export function RelationshipsSidePanel({
  workspaceId,
  recordId,
  fromObjectType,
}: RelationshipsSidePanelProps): JSX.Element {
  const { relationships, isLoading, error } = useRelationshipTabs(workspaceId, fromObjectType);

  const sections = relationships.filter(
    (relationship) =>
      !relationship.isRetired && relationship.fromObjectType === fromObjectType,
  );

  if (isLoading) {
    return (
      <section aria-label="Relationships" className="mws-card">
        <header className="mws-card__header">Relationships</header>
        <p className="mws-empty__body">Loading relationships…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label="Relationships" className="mws-card">
        <header className="mws-card__header">Relationships</header>
        <p role="alert" className="mws-alert mws-alert--warning">
          Couldn’t load relationships. Try again in a moment.
        </p>
      </section>
    );
  }

  if (sections.length === 0) {
    return (
      <section aria-label="Relationships" className="mws-card" data-ds="card">
        <header className="mws-card__header">Relationships</header>
        <p className="mws-empty__body">No relationships configured for this object.</p>
      </section>
    );
  }

  return (
    <section aria-label="Relationships" className="mws-card" data-ds="card">
      <header className="mws-card__header">Relationships</header>
      <ul className="mws-list">
        {sections.map((relationship) => (
          <RelationshipRow
            key={relationship.id}
            relationship={relationship}
            workspaceId={workspaceId}
            recordId={recordId}
          />
        ))}
      </ul>
    </section>
  );
}

interface RelationshipRowProps {
  relationship: RelationshipDto;
  workspaceId: WorkspaceId | null;
  recordId: RecordId | null;
}

function RelationshipRow({
  relationship,
  workspaceId,
  recordId,
}: RelationshipRowProps): JSX.Element {
  const [links, setLinks] = useState<RelationshipLinkDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId || !recordId) {
      setLinks([]);
      return undefined;
    }

    const controller = new AbortController();
    fetchRelationshipLinks(recordId, workspaceId, relationship.id, controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return;
        setLinks(rows);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Failed to load links.');
      });

    return () => controller.abort();
  }, [workspaceId, recordId, relationship.id]);

  const count = links?.length ?? 0;

  return (
    <li className="mws-list__row" data-ds="list-row">
      <div className="mws-list__label">
        <strong>{relationship.fromSideLabel}</strong>
        <span className="mws-badge" data-ds="badge">{count}</span>
      </div>
      {error ? (
        <p role="alert" className="mws-empty__body">
          Couldn’t load {relationship.fromSideLabel.toLowerCase()}.
        </p>
      ) : (
        // "Link a record" affordance ships in a follow-up cut — see the slice doc.
        // The row still surfaces the count so users see the relationship exists.
        <p className="mws-empty__body">
          {count === 0 ? 'No linked records yet.' : `${count} linked record${count === 1 ? '' : 's'}.`}
        </p>
      )}
    </li>
  );
}
