// Tests for the S4 Status-tab summary row (record-detail reconciliation).

import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { buildRequestDto } from '@/test-utils';

import { StatusSummaryRow } from './StatusSummaryRow';

expect.extend(toHaveNoViolations);

describe('StatusSummaryRow', () => {
  it('StatusSummaryRow — renders submitted and lifecycle name', async () => {
    // Arrange / Act
    const { container } = render(<StatusSummaryRow request={buildRequestDto()} />);

    // Assert — Status category was dropped (it echoed the Display-status pill + stepper).
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText('Lifecycle')).toBeInTheDocument();
    expect(screen.getByText('Standard delivery')).toBeInTheDocument();
    expect(screen.queryByText('Status category')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('StatusSummaryRow — an empty lifecycle name renders an em-dash', async () => {
    // Arrange / Act
    const { container } = render(
      <StatusSummaryRow request={buildRequestDto({ lifecycleName: '' })} />,
    );

    // Assert
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
