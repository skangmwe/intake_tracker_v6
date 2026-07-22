// Platform Fields & objects — Objects tab (S34). A read-only reference listing the Global built-in
// object types (Request, Task). No counts, no editor — the platform surface mirrors only the global
// object scope (blueprint §Object scope). Renders explicit loading / error / empty states
// (web-component-architecture.md). Rendered only for a platform admin (the page gates access).

import { useMemo } from 'react';

import type { ObjectDefinitionDto, ObjectLocation } from '@shared/types';

import { type TableColumn, TableShell } from '@/shared/components/Table';

import { usePlatformObjects } from '../usePlatformSchema';

const EM_DASH = '—';

// Read-only reference: name / plural / location / description. No Records/Fields counts (the platform
// scope has no per-workspace count) and no View column (nothing to open).
const COLUMNS: TableColumn[] = [
  { key: 'name', label: 'Object name', width: 200 },
  { key: 'plural', label: 'Plural label', width: 200 },
  { key: 'location', label: 'Location', width: 160 },
  { key: 'description', label: 'Description', flex: true },
];

function locationLabel(location: ObjectLocation): string {
  return location === 'Global' ? 'Global' : 'Local Workspace';
}

export function PlatformObjectsTab() {
  const objects = usePlatformObjects();

  const rows = useMemo(
    () =>
      (objects.data ?? []).map((object: ObjectDefinitionDto) => ({
        id: object.id,
        cells: [
          <span key="name" className="objects-cell-name">
            {object.name}
          </span>,
          <span key="plural">{object.pluralLabel ?? EM_DASH}</span>,
          locationLabel(object.location),
          <span key="description" className="objects-cell-desc">
            {object.description ?? EM_DASH}
          </span>,
        ],
      })),
    [objects.data],
  );

  return (
    <div className="objects-tab">
      {objects.isLoading && (
        <p className="caption" role="status">
          Loading objects…
        </p>
      )}

      {objects.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          The object list could not be loaded. Try again in a moment.
        </p>
      )}

      {objects.data && rows.length === 0 && (
        <div className="objects-tab__no-matches">
          <p className="objects-tab__no-matches-title">No global objects are defined yet</p>
        </div>
      )}

      {objects.data && rows.length > 0 && (
        <TableShell caption="Global objects" columns={COLUMNS} rows={rows} />
      )}
    </div>
  );
}
