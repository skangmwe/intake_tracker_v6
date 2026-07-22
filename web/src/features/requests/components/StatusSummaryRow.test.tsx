// Tests for the S4 Status-tab summary row (record-detail reconciliation).

import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { buildRequestDto } from '@/test-utils';

import { StatusSummaryRow } from './StatusSummaryRow';

expect.extend(toHaveNoViolations);

describe('StatusSummaryRow', () => {
  it('StatusSummaryRow — renders submitted, lifecycle name, and the current status category', async () => {
    // Arrange / Act — default record sits at the intake stage (category "Intake").
    const { container } = render(<StatusSummaryRow request={buildRequestDto()} />);

    // Assert
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText('Lifecycle')).toBeInTheDocument();
    expect(screen.getByText('Standard delivery')).toBeInTheDocument();
    expect(screen.getByText('Status category')).toBeInTheDocument();
    expect(screen.getByText('Intake')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('StatusSummaryRow — an unresolved status category renders an em-dash', async () => {
    // Arrange / Act — a stage not in the lifecycle's list yields no category.
    const { container } = render(<StatusSummaryRow request={buildRequestDto({ stage: 'ghost-stage' })} />);

    // Assert — Submitted + Lifecycle still resolve, so the only em-dash is the category slot.
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
