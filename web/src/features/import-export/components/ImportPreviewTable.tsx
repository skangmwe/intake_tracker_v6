// CSV preview table (S28 import wizard, upload step). Shows the parsed header row + the first N data
// rows so the user can confirm their columns before mapping. Scrolls within its own container so the
// page never scrolls horizontally (responsive-and-mobile.md). Presentational — the parse lives in
// csvPreview.ts.

import type { CsvPreview } from '../csvPreview';

export function ImportPreviewTable({ preview }: { preview: CsvPreview }) {
  return (
    <div className="ie-preview">
      <table className="ie-preview__table" data-ds="preview-table">
        <caption className="ie-map__caption">
          Preview — first {preview.rows.length} {preview.rows.length === 1 ? 'row' : 'rows'}
          {preview.truncated ? ' (more rows will import)' : ''}.
        </caption>
        <thead>
          <tr>
            {preview.headers.map((header, index) => (
              <th key={`${header}-${index}`} scope="col">
                {header || '(unnamed)'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {preview.headers.map((_, colIndex) => (
                <td key={colIndex}>{row[colIndex] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
