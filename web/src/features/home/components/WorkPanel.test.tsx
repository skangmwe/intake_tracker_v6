// Tests for WorkPanel — the overdue-badge branch, the plain (no-badge) due branch, and the empty note.
// axe on the populated + empty states.

import { screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { HomeWorkItem } from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import { WorkPanel } from './WorkPanel';

expect.extend(toHaveNoViolations);

const overdue: HomeWorkItem = {
  recordId: 'REQ-0991', name: 'Billing checker', stageLabel: 'QA', origin: 'Finance', dueDate: '2026-07-01', slaStatus: 'Overdue',
};
const onTrack: HomeWorkItem = {
  recordId: 'REQ-0899', name: 'Deposition rollout', stageLabel: 'Post-launch', origin: 'Litigation', dueDate: '2026-09-01', slaStatus: 'OnTrack',
};

it('WorkPanel — overdue item — renders the overdue badge; on-track item renders plain due text', async () => {
  // Act
  const { container } = renderWithProviders(<WorkPanel items={[overdue, onTrack]} count={2} />);

  // Assert — the overdue row shows the tinted "Overdue" badge; the on-track row shows plain "Due …".
  expect(screen.getByText('Overdue')).toHaveClass('home-badge--overdue');
  expect(screen.getByText(/^Due /)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Billing checker/i })).toHaveAttribute('href', '/requests/REQ-0991');
  expect(await axe(container)).toHaveNoViolations();
});

it('WorkPanel — empty — shows the empty note', async () => {
  // Act
  const { container } = renderWithProviders(<WorkPanel items={[]} count={0} />);

  // Assert
  expect(screen.getByText('Nothing assigned to you today.')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});
