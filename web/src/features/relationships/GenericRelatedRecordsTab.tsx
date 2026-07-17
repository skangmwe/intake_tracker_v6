// GenericRelatedRecordsTab — the shared renderer for a config-driven relationship-driven
// tab on S4/S5 (Slice 25). Given one Relationship (already resolved by the parent), lists
// the linked records for the current record in either direction. Loading / error / empty
// states rendered explicitly per web-component-architecture.md; the "New ___" affordance is
// a placeholder here (link-create UI ships in the S30 admin cut + a future intake iteration
// — the tab still surfaces existence, direction, and counts today).

import { useEffect, useState } from 'react';

import type {
  RecordId,
  RelationshipDto,
  RelationshipLinkDto,
  WorkspaceId,
} from '@shared/types';

import { fetchRelationshipLinks } from './api';

export interface GenericRelatedRecordsTabProps {
  workspaceId: WorkspaceId | null;
  recordId: RecordId | null;
  relationship: RelationshipDto;
}

export function GenericRelatedRecordsTab({
  workspaceId,
  recordId,
  relationship,
}: GenericRelatedRecordsTabProps): JSX.Element {
  const [links, setLinks] = useState<RelationshipLinkDto[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId || !recordId) {
      setLinks([]);
      return undefined;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    fetchRelationshipLinks(recordId, workspaceId, relationship.id, controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return;
        setLinks(rows);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Failed to load linked records.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [workspaceId, recordId, relationship.id]);

  const tabTitle = relationship.tabLabel ?? relationship.fromSideLabel;

  if (isLoading) {
    return (
      <section aria-labelledby="related-records-heading" className="mws-card" data-ds="card">
        <header className="mws-card__header" id="related-records-heading">
          {tabTitle}
        </header>
        <p className="mws-empty__body" role="status">
          Loading {tabTitle.toLowerCase()}…
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section aria-labelledby="related-records-heading" className="mws-card" data-ds="card">
        <header className="mws-card__header" id="related-records-heading">
          {tabTitle}
        </header>
        <p role="alert" className="mws-alert mws-alert--warning">
          Couldn’t load {tabTitle.toLowerCase()}. Try again in a moment.
        </p>
      </section>
    );
  }

  const rows = links ?? [];

  if (rows.length === 0) {
    return (
      <section aria-labelledby="related-records-heading" className="mws-card" data-ds="card">
        <header className="mws-card__header" id="related-records-heading">
          {tabTitle}
        </header>
        <p className="mws-empty__body">
          No {tabTitle.toLowerCase()} yet.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="related-records-heading" className="mws-card" data-ds="card">
      <header className="mws-card__header" id="related-records-heading">
        {tabTitle}
        <span className="mws-badge" data-ds="badge" aria-label={`${rows.length} linked`}>
          {rows.length}
        </span>
      </header>
      <ul className="mws-list">
        {rows.map((link) => (
          <RelatedRecordRow key={link.id} relationship={relationship} link={link} />
        ))}
      </ul>
    </section>
  );
}

interface RelatedRecordRowProps {
  relationship: RelationshipDto;
  link: RelationshipLinkDto;
}

function RelatedRecordRow({ relationship, link }: RelatedRecordRowProps): JSX.Element {
  const counterpartyRecordId = link.direction === 'Out' ? link.toRecordId : link.fromRecordId;
  const directionLabel =
    link.direction === 'Out' ? relationship.toSideLabel : relationship.fromSideLabel;

  return (
    <li className="mws-list__row" data-ds="list-row">
      <div className="mws-list__label">
        <strong>{link.toRecordDisplayName}</strong>
        <code className="mws-ident">{counterpartyRecordId}</code>
      </div>
      <div className="mws-list__meta">
        <span className="mws-badge" data-ds="badge">{directionLabel}</span>
        {link.toRecordStage ? (
          <span className="mws-badge mws-badge--info" data-ds="badge">{link.toRecordStage}</span>
        ) : null}
      </div>
    </li>
  );
}
