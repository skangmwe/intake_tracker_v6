// Tests for TriagePanel — the populated list (row link + Unassigned pill) and the empty note. axe both.

import { screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { HomeTriageItem } from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import { TriagePanel } from './TriagePanel';

expect.extend(toHaveNoViolations);

const item: HomeTriageItem = {
  recordId: 'REQ-1061', name: 'K-1 extraction', origin: 'Escalated · Tax', receivedAt: '2026-07-06T11:00:00Z',
};

it('TriagePanel — populated — links the row and shows the Unassigned pill', async () => {
  // Act
  const { container } = renderWithProviders(<TriagePanel items={[item]} count={1} />);

  // Assert
  expect(screen.getByRole('link', { name: /K-1 extraction/i })).toHaveAttribute('href', '/requests/REQ-1061');
  expect(screen.getByText('Unassigned')).toHaveClass('home-badge--unassigned');
  expect(screen.getByText('1 unassigned')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('TriagePanel — empty — shows the empty note', async () => {
  // Act
  const { container } = renderWithProviders(<TriagePanel items={[]} count={0} />);

  // Assert
  expect(screen.getByText('Nothing waiting to be triaged.')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});
