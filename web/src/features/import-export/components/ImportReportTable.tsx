// The per-row validation report (S28). One table row per flagged reason — hard failures AND
// Requestor-fallback warnings — so nothing is silent (BS §13). Rows that landed cleanly are only
// counted (in the summary above), not listed here. Semantic table with a caption + scoped headers
// (data-visualization.md / accessibility.md).

import type { ImportFlaggedRow } from '@shared/types';

const EM_DASH = '—';

interface FlatReason {
  key: string;
  rowIndex: number;
  field: string;
  message: string;
  code: string;
}

function flatten(rows: ImportFlaggedRow[]): FlatReason[] {
  const flat: FlatReason[] = [];
  for (const row of rows) {
    row.reasons.forEach((reason, index) => {
      flat.push({
        key: `${row.rowIndex}-${index}`,
        rowIndex: row.rowIndex,
        field: reason.field ?? EM_DASH,
        message: reason.message,
        code: reason.code,
      });
    });
  }
  return flat;
}

export function ImportReportTable({ rows }: { rows: ImportFlaggedRow[] }) {
  const flat = flatten(rows);
  if (flat.length === 0) {
    return null;
  }

  return (
    // Keyboard-focusable so a keyboard-only user can scroll the report horizontally
    // (axe scrollable-region-focusable); labelled as a region for screen readers.
    <div className="ie-report" tabIndex={0} role="region" aria-label="Import validation report">
      <table className="ie-report__table">
        <caption className="ie-report__caption">Rows needing attention</caption>
        <thead>
          <tr>
            <th scope="col" className="ie-report__num">
              Row
            </th>
            <th scope="col">Field</th>
            <th scope="col">Issue</th>
          </tr>
        </thead>
        <tbody>
          {flat.map((reason) => (
            <tr key={reason.key}>
              <td className="ie-report__num">{reason.rowIndex}</td>
              <td>{reason.field}</td>
              <td>
                {reason.message}{' '}
                <span className="ie-report__code" data-code={reason.code}>
                  {reason.code}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
