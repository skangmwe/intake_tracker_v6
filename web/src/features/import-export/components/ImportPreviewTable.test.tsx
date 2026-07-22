// Tests for ImportPreviewTable — the upload-step CSV preview. Covers header + row rendering, the
// truncation note, an unnamed-column fallback, and jest-axe.

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';

import type { CsvPreview } from '../csvPreview';
import { ImportPreviewTable } from './ImportPreviewTable';

describe('ImportPreviewTable', () => {
  it('ImportPreviewTable — renders headers and rows', () => {
    const preview: CsvPreview = {
      headers: ['Name', 'Owner'],
      rows: [
        ['Alpha', 'Alex'],
        ['Beta', 'Sam'],
      ],
      truncated: false,
    };
    render(<ImportPreviewTable preview={preview} />);
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText(/Preview — first 2 rows/)).toBeInTheDocument();
  });

  it('ImportPreviewTable — truncated — notes more rows will import', () => {
    const preview: CsvPreview = { headers: ['H'], rows: [['x']], truncated: true };
    render(<ImportPreviewTable preview={preview} />);
    expect(screen.getByText(/more rows will import/)).toBeInTheDocument();
  });

  it('ImportPreviewTable — unnamed column — shows a fallback header', () => {
    const preview: CsvPreview = { headers: [''], rows: [['v']], truncated: false };
    render(<ImportPreviewTable preview={preview} />);
    expect(screen.getByRole('columnheader', { name: '(unnamed)' })).toBeInTheDocument();
  });

  it('ImportPreviewTable — default render — has no axe violations', async () => {
    const preview: CsvPreview = { headers: ['A', 'B'], rows: [['1', '2']], truncated: false };
    const { container } = render(<ImportPreviewTable preview={preview} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
