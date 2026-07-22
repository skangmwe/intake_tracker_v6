// Client-side CSV preview parser for the import wizard (S28). Parses a CSV string into a header row
// plus the first N data rows so the user can see their columns before mapping. RFC-4180 aware: quoted
// fields, doubled quotes, and commas / newlines inside quotes are handled. This is preview-only — the
// authoritative parse still happens server-side (CsvHelper). No dependency is added; the parser is a
// small state machine so the wizard stays within web-dependency-security.md.

export interface CsvPreview {
  /** The header row (first record). Empty when the text has no content. */
  headers: string[];
  /** Up to `rowLimit` data rows, each aligned positionally to `headers`. */
  rows: string[][];
  /** True when the file held more data rows than the returned preview. */
  truncated: boolean;
}

/**
 * Parse up to `maxRecords` complete CSV records from `text`. A record is a full row; newlines inside
 * quoted fields do not end a record. Stops once `maxRecords` records are complete (the caller asks for
 * one more than it needs, to detect truncation).
 */
function parseRecords(text: string, maxRecords: number): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let sawAnyChar = false;

  const endField = () => {
    record.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
    sawAnyChar = false;
  };

  for (let index = 0; index < text.length && records.length < maxRecords; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      sawAnyChar = true;
    } else if (char === ',') {
      endField();
      sawAnyChar = true;
    } else if (char === '\r') {
      // Swallow CR; the following LF ends the record (or a lone CR ends it too).
      if (text[index + 1] === '\n') {
        index += 1;
      }
      endRecord();
    } else if (char === '\n') {
      endRecord();
    } else {
      field += char;
      sawAnyChar = true;
    }
  }

  // Flush a trailing record that did not end with a newline (only if it carried content).
  if (records.length < maxRecords && (sawAnyChar || field.length > 0 || record.length > 0)) {
    endRecord();
  }

  return records;
}

/** Parse a CSV string into a header + the first `rowLimit` data rows, flagging truncation. */
export function parseCsvPreview(text: string, rowLimit: number): CsvPreview {
  // Ask for header + rowLimit + 1 so an extra record signals there is more than the preview shows.
  const records = parseRecords(text, rowLimit + 2);
  if (records.length === 0) {
    return { headers: [], rows: [], truncated: false };
  }

  const headers = records[0] ?? [];
  const dataRecords = records.slice(1);
  const truncated = dataRecords.length > rowLimit;
  return {
    headers,
    rows: dataRecords.slice(0, rowLimit),
    truncated,
  };
}
