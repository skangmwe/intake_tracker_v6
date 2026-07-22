// Import column-mapping table (S28 import wizard, step 3). One row per CSV column: the source header,
// a sample value from the preview, and a <select> of the object's import fields (plus "Don't import").
// Duplicate targets are flagged inline. Semantic table; each select carries an aria-label (the "Maps
// to" column header already names the control's purpose, so a visible per-row label would be redundant)
// and links its duplicate error via aria-describedby (data-visualization.md / accessibility.md).

import type { IoFieldSpec } from '@shared/types';

import { duplicateFieldKeys, type ColumnMapping } from '../importMapping';

const DONT_IMPORT = '';

interface ImportColumnMapperProps {
  headers: string[];
  /** First preview data row, for a sample value per column. */
  sampleRow: string[] | undefined;
  fields: IoFieldSpec[];
  mapping: ColumnMapping;
  onChange: (columnIndex: number, fieldKey: string) => void;
}

export function ImportColumnMapper({
  headers,
  sampleRow,
  fields,
  mapping,
  onChange,
}: ImportColumnMapperProps) {
  const duplicates = duplicateFieldKeys(mapping);

  return (
    <div className="ie-map">
      <table className="ie-map__table" data-ds="mapping-table">
        <caption className="ie-map__caption">
          Map each CSV column to a field, or leave it out.
        </caption>
        <thead>
          <tr>
            <th scope="col">CSV column</th>
            <th scope="col">Sample</th>
            <th scope="col">Maps to</th>
          </tr>
        </thead>
        <tbody>
          {headers.map((header, index) => {
            const selectedKey = mapping[index] ?? DONT_IMPORT;
            const isDuplicate = selectedKey !== DONT_IMPORT && duplicates.has(selectedKey);
            const errorId = isDuplicate ? `ie-map-error-${index}` : undefined;
            return (
              <tr key={`${header}-${index}`}>
                <td className="ie-map__col">
                  {header || <span className="ie-map__muted">(unnamed)</span>}
                </td>
                <td className="ie-map__sample">
                  {sampleRow?.[index] ? sampleRow[index] : <span className="ie-map__muted">—</span>}
                </td>
                <td className="ie-map__select">
                  <select
                    className="mws-select"
                    aria-label={`Map column ${header || `#${index + 1}`} to a field`}
                    aria-invalid={isDuplicate || undefined}
                    aria-describedby={errorId}
                    value={selectedKey}
                    onChange={(event) => onChange(index, event.target.value)}
                  >
                    <option value={DONT_IMPORT}>— Don’t import —</option>
                    {fields.map((field) => (
                      <option key={field.key} value={field.key}>
                        {field.required ? `${field.label} (required)` : field.label}
                      </option>
                    ))}
                  </select>
                  {isDuplicate && (
                    <span id={errorId} className="ie-map__error" role="alert">
                      This field is already mapped to another column.
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
