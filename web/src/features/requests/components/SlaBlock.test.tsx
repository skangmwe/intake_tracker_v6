// Tests for the S4 Status-tab SLA block (record-detail reconciliation).

import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { SlaBlock } from './SlaBlock';

expect.extend(toHaveNoViolations);

describe('SlaBlock', () => {
  it('SlaBlock — Overdue — shows the Overdue label and detail', async () => {
    // Arrange / Act
    const { container } = render(<SlaBlock slaStatus="Overdue" />);

    // Assert
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Past the due date.')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('SlaBlock — DueSoon — shows the Due soon label', async () => {
    const { container } = render(<SlaBlock slaStatus="DueSoon" />);
    expect(screen.getByText('Due soon')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('SlaBlock — OnTrack — shows the On track label', async () => {
    const { container } = render(<SlaBlock slaStatus="OnTrack" />);
    expect(screen.getByText('On track')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('SlaBlock — no due date (undefined) — shows the muted No due date state', async () => {
    const { container } = render(<SlaBlock slaStatus={undefined} />);
    expect(screen.getByText('No due date')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
