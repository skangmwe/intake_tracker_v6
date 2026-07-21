// Tests for DecisionsPanel — the populated list (row link + waiting time) and the empty note. axe both.

import { screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { HomeDecisionItem } from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import { DecisionsPanel } from './DecisionsPanel';

expect.extend(toHaveNoViolations);

const item: HomeDecisionItem = {
  recordId: 'REQ-1042',
  name: 'Clause extraction',
  gateLabel: 'Execution → Validation',
  roleLabel: 'AI Solutions Manager',
  openedAt: '2026-07-04T12:00:00Z',
};

it('DecisionsPanel — populated — links the row to the record and shows the gate meta', async () => {
  // Act
  const { container } = renderWithProviders(<DecisionsPanel items={[item]} count={1} />);

  // Assert
  const link = screen.getByRole('link', { name: /Clause extraction/i });
  expect(link).toHaveAttribute('href', '/requests/REQ-1042');
  expect(screen.getByText(/Execution → Validation/)).toBeInTheDocument();
  expect(screen.getByText('1 open')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('DecisionsPanel — empty — shows the empty note', async () => {
  // Act
  const { container } = renderWithProviders(<DecisionsPanel items={[]} count={0} />);

  // Assert
  expect(screen.getByText('No gates are waiting on you right now.')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});
