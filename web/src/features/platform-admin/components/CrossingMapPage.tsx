// S35 Crossing map — the firm's PG→AI field mappings, read-only in R1 Phase 1 (BS §6.2; the
// propose/confirm workflow is slice 24). A data-dense table (data-visualization.md): scoped headers,
// 1px row rules, no vertical dividers, scrolls within its own shell. Renders the three non-data states
// explicitly. The read-only status is stated inline so the surface never looks half-built.

import { PlatformGate } from './PlatformGate';
import { useCrossingMap } from '../useCrossingMap';
import { usePlatformAdmin } from '../usePlatformAdmin';

const EM_DASH = '—';

function CrossingMapSurface() {
  const { data, isLoading, isError } = useCrossingMap(true);

  return (
    <>
      <p className="mws-alert mws-alert--info platform-admin__note" role="note">
        The crossing map is read-only in this release. New and changed mappings arrive with the
        propose / confirm workflow.
      </p>

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
                <th scope="col">Field key</th>
                <th scope="col">Type</th>
                <th scope="col">AI Solutions field</th>
                <th scope="col">Field key</th>
                <th scope="col">Type</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={`${row.sourceFieldKey}→${row.targetFieldKey}`}>
                  <td>{row.sourceDisplayName || EM_DASH}</td>
                  <td className="platform-table__key">{row.sourceFieldKey}</td>
                  <td>{row.sourceFieldType || EM_DASH}</td>
                  <td>{row.targetDisplayName || EM_DASH}</td>
                  <td className="platform-table__key">{row.targetFieldKey}</td>
                  <td>{row.targetFieldType || EM_DASH}</td>
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
      lead="How PG/Dept request fields map to AI Solutions fields when a request is escalated."
    >
      {isPlatformAdmin && <CrossingMapSurface />}
    </PlatformGate>
  );
}
