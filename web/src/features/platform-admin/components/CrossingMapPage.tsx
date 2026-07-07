// S35 Crossing map — the firm's PG→AI field mappings with the propose / confirm workflow (slice 24,
// BS §6.2). A data-dense table (data-visualization.md): scoped headers, 1px row rules, no vertical
// dividers, scrolls within its own shell. Seeded rows are immutable 1:1 pairs; durable rows carry a
// status (Proposed → Confirmed) and, when Proposed, a Confirm action. The propose form sits above the
// table. Renders the three non-data states explicitly.

import type { CrossingMapRowDto, CrossingMapStatus } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { problemMessage } from '@/shared/http/problemMessage';

import { PlatformGate } from './PlatformGate';
import { ProposeCrossingForm } from './ProposeCrossingForm';
import { useConfirmCrossingMap, useCrossingMap } from '../useCrossingMap';
import { usePlatformAdmin } from '../usePlatformAdmin';

const EM_DASH = '—';

const STATUS_LABEL: Record<CrossingMapStatus, string> = {
  Seeded: 'Seeded',
  Proposed: 'Proposed',
  Confirmed: 'Confirmed',
};

const STATUS_CLASS: Record<CrossingMapStatus, string> = {
  Seeded: 'cm-status--seeded',
  Proposed: 'cm-status--proposed',
  Confirmed: 'cm-status--confirmed',
};

function StatusBadge({ status }: { status: CrossingMapStatus }) {
  return (
    <span className={`cm-status ${STATUS_CLASS[status]}`} data-ds="badge">
      {STATUS_LABEL[status]}
    </span>
  );
}

function CrossingMapSurface() {
  const { data, isLoading, isError } = useCrossingMap(true);
  const confirm = useConfirmCrossingMap();

  const onConfirm = (row: CrossingMapRowDto) => {
    if (row.crossingMapId) confirm.mutate(row.crossingMapId);
  };

  return (
    <>
      <ProposeCrossingForm />

      {confirm.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          {problemMessage(confirm.error)}
        </p>
      )}

      {isLoading && (
        <p className="caption" role="status">
          Loading the crossing map…
        </p>
      )}

      {isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          The crossing map could not be loaded. Try again in a moment.
        </p>
      )}

      {data && data.length === 0 && (
        <p className="platform-admin__empty">No crossing fields are mapped yet.</p>
      )}

      {data && data.length > 0 && (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a horizontally-scrollable region must be keyboard-focusable (axe scrollable-region-focusable).
        <div className="platform-table-shell" tabIndex={0} role="region" aria-label="Crossing map">
          <table className="platform-table" data-ds="table">
            <caption className="mws-sr-only">Crossing map — PG/Dept fields mapped to AI Solutions fields</caption>
            <thead>
              <tr>
                <th scope="col">PG / Dept field</th>
                <th scope="col">Type</th>
                <th scope="col">AI Solutions field</th>
                <th scope="col">Type</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.crossingMapId ?? `seeded:${row.sourceFieldKey}→${row.targetFieldKey}`}>
                  <td>
                    {row.sourceDisplayName || EM_DASH}
                    <span className="platform-table__key">{row.sourceFieldKey}</span>
                  </td>
                  <td>{row.sourceFieldType || EM_DASH}</td>
                  <td>
                    {row.targetDisplayName || EM_DASH}
                    <span className="platform-table__key">{row.targetFieldKey}</span>
                  </td>
                  <td>{row.targetFieldType || EM_DASH}</td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td>
                    {row.status === 'Proposed' && row.crossingMapId ? (
                      <Button
                        variant="secondary"
                        compact
                        onClick={() => onConfirm(row)}
                        disabled={confirm.isPending}
                      >
                        Confirm
                      </Button>
                    ) : (
                      <span className="cm-noaction">{EM_DASH}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function CrossingMapPage() {
  const { isPlatformAdmin } = usePlatformAdmin();

  return (
    <PlatformGate
      title="Crossing map"
      lead="How PG/Dept request fields map to AI Solutions fields when a request is escalated. Propose a new mapping, then confirm it to make it live."
    >
      {isPlatformAdmin && <CrossingMapSurface />}
    </PlatformGate>
  );
}
