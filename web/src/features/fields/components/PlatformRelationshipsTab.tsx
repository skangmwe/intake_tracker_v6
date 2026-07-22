// Platform Fields & objects — Relationships tab (S34). A read-only reference of the canonical
// system-seeded relationships that every workspace inherits (e.g. Request → Task), de-duplicated
// across workspaces. Relationships are workspace-local metadata with no editable platform scope, so
// this surface only reports them — no workspace picker, no create / retire. Renders explicit loading
// / error / empty states (web-component-architecture.md). Platform admin only (the page gates access).

import { useMemo } from 'react';

import type { RelationshipCardinality, RelationshipDto } from '@shared/types';

import { type TableColumn, TableShell } from '@/shared/components/Table';

import { usePlatformRelationships } from '../usePlatformSchema';

const EM_DASH = '—';

const CARDINALITY_LABELS: Record<RelationshipCardinality, string> = {
  OneToOne: 'One to one',
  OneToMany: 'One to many',
  ManyToMany: 'Many to many',
};

function cardinalityLabel(cardinality: string): string {
  return CARDINALITY_LABELS[cardinality as RelationshipCardinality] ?? cardinality;
}

// Read-only reference: the relationship, the objects it links, its cardinality, the side labels, and
// its origin (always System — every row here is a system-seeded relationship).
const COLUMNS: TableColumn[] = [
  { key: 'relationship', label: 'Relationship', width: 220 },
  { key: 'objects', label: 'Objects', width: 200 },
  { key: 'cardinality', label: 'Cardinality', width: 140 },
  { key: 'sideLabels', label: 'Side labels', flex: true },
  { key: 'origin', label: 'Origin', width: 120 },
];

function sideLabels(relationship: RelationshipDto): string {
  const from = relationship.fromSideLabel?.trim();
  const to = relationship.toSideLabel?.trim();
  if (!from && !to) return EM_DASH;
  return `${from || EM_DASH} / ${to || EM_DASH}`;
}

export function PlatformRelationshipsTab() {
  const relationships = usePlatformRelationships();

  const rows = useMemo(
    () =>
      (relationships.data ?? [])
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((relationship: RelationshipDto) => ({
          id: relationship.id,
          cells: [
            <span key="relationship" className="objects-cell-name">
              {relationship.name}
            </span>,
            <span key="objects">
              <span className="mws-badge" data-ds="badge">
                {relationship.fromObjectType}
              </span>
              <span aria-hidden> → </span>
              <span className="mws-badge" data-ds="badge">
                {relationship.toObjectType}
              </span>
            </span>,
            cardinalityLabel(relationship.cardinality),
            <span key="sideLabels">{sideLabels(relationship)}</span>,
            <span
              key="origin"
              className="mws-badge mws-badge--draft"
              data-ds="badge"
              aria-label="System relationship"
            >
              System
            </span>,
          ],
        })),
    [relationships.data],
  );

  return (
    <div className="objects-tab">
      <p className="body objects-tab__intro">
        System relationships are seeded into every workspace. They are managed centrally and are
        read-only here.
      </p>

      {relationships.isLoading && (
        <p className="caption" role="status">
          Loading relationships…
        </p>
      )}

      {relationships.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          The platform relationship list could not be loaded. Try again in a moment.
        </p>
      )}

      {relationships.data && rows.length === 0 && (
        <div className="objects-tab__no-matches">
          <p className="objects-tab__no-matches-title">No inherited relationships yet</p>
        </div>
      )}

      {relationships.data && rows.length > 0 && (
        <TableShell caption="Inherited system relationships" columns={COLUMNS} rows={rows} />
      )}
    </div>
  );
}
