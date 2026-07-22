// Platform Fields & objects — Relationships tab (S34). Relationships carry no platform-vs-workspace
// scope, so this is a read-only reference scoped by a workspace picker: the platform admin chooses a
// workspace and sees that workspace's relationships (they need not be a member of it). Renders
// explicit loading / error / empty states (web-component-architecture.md). Platform admin only (the
// page gates access).

import { useMemo, useState } from 'react';

import type { RelationshipCardinality, RelationshipDto, WorkspaceId } from '@shared/types';

import { usePlatformRelationships, usePlatformWorkspaces } from '../usePlatformSchema';

const CARDINALITY_LABELS: Record<RelationshipCardinality, string> = {
  OneToOne: 'One to one',
  OneToMany: 'One to many',
  ManyToMany: 'Many to many',
};

export function PlatformRelationshipsTab() {
  const workspaces = usePlatformWorkspaces();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<WorkspaceId | null>(null);

  const workspaceId = selectedWorkspaceId ?? workspaces.data?.[0]?.id ?? null;
  const relationships = usePlatformRelationships(workspaceId);

  const sorted = useMemo(
    () =>
      (relationships.data ?? []).slice().sort((left, right) => left.sortOrder - right.sortOrder),
    [relationships.data],
  );

  if (workspaces.isLoading) {
    return (
      <p className="caption" role="status">
        Loading workspaces…
      </p>
    );
  }

  if (workspaces.isError) {
    return (
      <p className="mws-alert mws-alert--error" role="alert">
        The workspace list could not be loaded. Try again in a moment.
      </p>
    );
  }

  if (!workspaces.data || workspaces.data.length === 0 || workspaceId === null) {
    return (
      <div className="objects-tab__no-matches">
        <p className="objects-tab__no-matches-title">No workspaces to show relationships for</p>
      </div>
    );
  }

  return (
    <div className="objects-tab">
      <label className="mws-field">
        <span className="caption">Workspace</span>
        <select
          className="mws-select"
          value={workspaceId}
          onChange={(event) => setSelectedWorkspaceId(event.target.value as WorkspaceId)}
        >
          {workspaces.data.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
      </label>

      {relationships.isLoading && (
        <p className="caption" role="status">
          Loading relationships…
        </p>
      )}

      {relationships.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          Relationships could not be loaded. Try again in a moment.
        </p>
      )}

      {relationships.data && sorted.length === 0 && (
        <div className="objects-tab__no-matches">
          <p className="objects-tab__no-matches-title">No relationships in this workspace</p>
        </div>
      )}

      {relationships.data && sorted.length > 0 && (
        <div className="mws-table-shell">
          <table className="mws-table" data-ds="table">
            <caption className="visually-hidden">Relationships in the selected workspace</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">From → To</th>
                <th scope="col">Cardinality</th>
                <th scope="col">Show as tab</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((relationship) => (
                <RelationshipRow key={relationship.id} relationship={relationship} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RelationshipRow({ relationship }: { relationship: RelationshipDto }) {
  return (
    <tr>
      <td>
        <span className="body">{relationship.name}</span>
        {relationship.isSystem && (
          <>
            {' '}
            <span
              className="mws-badge mws-badge--draft"
              data-ds="badge"
              aria-label="System relationship"
            >
              System
            </span>
          </>
        )}
      </td>
      <td>
        <span className="mws-badge" data-ds="badge">
          {relationship.fromObjectType}
        </span>
        <span aria-hidden> → </span>
        <span className="mws-badge" data-ds="badge">
          {relationship.toObjectType}
        </span>
      </td>
      <td>{CARDINALITY_LABELS[relationship.cardinality] ?? relationship.cardinality}</td>
      <td>{relationship.showOnFromAsTab ? 'Yes' : '—'}</td>
      <td>
        {relationship.isRetired ? (
          <span className="mws-badge mws-badge--archived" data-ds="badge">
            Retired
          </span>
        ) : (
          <span className="mws-badge mws-badge--live" data-ds="badge">
            Active
          </span>
        )}
      </td>
    </tr>
  );
}
