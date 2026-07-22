// Tests for ImportReportTable — the per-row validation report. Covers the flatten of multiple reasons
// per row, the null render when there is nothing to report, and an axe pass on the populated table.

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';

import type { ImportFlaggedRow } from '@shared/types';

import { ImportReportTable } from './ImportReportTable';

const ROWS: ImportFlaggedRow[] = [
  {
    rowIndex: 2,
    reasons: [
      { code: 'missing-required', message: 'A request name is required.', field: 'name' },
      {
        code: 'invalid-value',
        message: 'Business Value must be a whole number from 1 to 5.',
        field: 'businessValue',
      },
    ],
  },
  {
    rowIndex: 4,
    reasons: [
      {
        code: 'requestor-fallback',
        message: 'Requestor defaulted to the importing admin.',
        field: 'requestor',
      },
    ],
  },
];

describe('ImportReportTable', () => {
  it('flattens every reason into its own row', () => {
    // Act
    render(<ImportReportTable rows={ROWS} />);

    // Assert — three reasons across two source rows → three table body rows + the header row.
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.getByText('A request name is required.')).toBeInTheDocument();
    expect(screen.getByText('Requestor defaulted to the importing admin.')).toBeInTheDocument();
    expect(screen.getByText('missing-required')).toBeInTheDocument();
  });

  it('renders nothing when there are no flagged rows', () => {
    // Act
    const { container } = render(<ImportReportTable rows={[]} />);

    // Assert
    expect(container).toBeEmptyDOMElement();
  });

  it('has no axe violations when populated', async () => {
    // Arrange
    const { container } = render(<ImportReportTable rows={ROWS} />);

    // Act + Assert
    expect(await axe(container)).toHaveNoViolations();
  });
});
