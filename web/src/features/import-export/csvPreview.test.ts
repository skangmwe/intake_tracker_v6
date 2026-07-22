// Unit tests for the client-side CSV preview parser (S28 import wizard). Covers header + row
// extraction, RFC-4180 quoting (commas / quotes / newlines inside quotes), CRLF and LF line endings,
// a trailing newline, truncation detection, and the empty-input case.

import { parseCsvPreview } from './csvPreview';

describe('parseCsvPreview', () => {
  it('parseCsvPreview — simple rows — returns headers and rows', () => {
    // Arrange
    const text = 'Name,Owner\nAlpha,Alex\nBeta,Sam\n';

    // Act
    const preview = parseCsvPreview(text, 10);

    // Assert
    expect(preview.headers).toEqual(['Name', 'Owner']);
    expect(preview.rows).toEqual([
      ['Alpha', 'Alex'],
      ['Beta', 'Sam'],
    ]);
    expect(preview.truncated).toBe(false);
  });

  it('parseCsvPreview — quoted commas, quotes, and newlines — parses as one field', () => {
    // Arrange — a quoted field with a comma, a doubled quote, and an embedded newline.
    const text = 'Name,Note\n"Alpha, Inc.","He said ""hi""\nsecond line"\n';

    // Act
    const preview = parseCsvPreview(text, 10);

    // Assert
    expect(preview.headers).toEqual(['Name', 'Note']);
    expect(preview.rows[0]).toEqual(['Alpha, Inc.', 'He said "hi"\nsecond line']);
  });

  it('parseCsvPreview — CRLF line endings — splits records', () => {
    const preview = parseCsvPreview('A,B\r\n1,2\r\n3,4\r\n', 10);
    expect(preview.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('parseCsvPreview — more rows than the limit — truncates and flags it', () => {
    // Arrange — 3 data rows, limit 2.
    const text = 'H\na\nb\nc\n';

    // Act
    const preview = parseCsvPreview(text, 2);

    // Assert
    expect(preview.rows).toEqual([['a'], ['b']]);
    expect(preview.truncated).toBe(true);
  });

  it('parseCsvPreview — no trailing newline — still captures the last row', () => {
    const preview = parseCsvPreview('H1,H2\nx,y', 10);
    expect(preview.rows).toEqual([['x', 'y']]);
    expect(preview.truncated).toBe(false);
  });

  it('parseCsvPreview — empty text — returns empty headers and rows', () => {
    const preview = parseCsvPreview('', 10);
    expect(preview.headers).toEqual([]);
    expect(preview.rows).toEqual([]);
    expect(preview.truncated).toBe(false);
  });

  it('parseCsvPreview — header only — returns headers and no rows', () => {
    const preview = parseCsvPreview('Name,Owner\n', 10);
    expect(preview.headers).toEqual(['Name', 'Owner']);
    expect(preview.rows).toEqual([]);
  });
});
