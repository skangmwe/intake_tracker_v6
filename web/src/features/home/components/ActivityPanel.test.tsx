// Tests for ActivityPanel — a record event (navigable link) and a record-less event (static line),
// plus the empty note. axe on the populated + empty states.

import { screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { HomeActivityItem } from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import { ActivityPanel } from './ActivityPanel';

expect.extend(toHaveNoViolations);

const recordEvent: HomeActivityItem = {
  recordId: 'REQ-0899', name: 'Deposition summarizer', eventType: 'gate.resolved', actorName: 'M. Reyes', eventAt: '2026-07-06T10:00:00Z',
};
const recordlessEvent: HomeActivityItem = {
  recordId: null, name: '', eventType: 'config.role.added', actorName: null, eventAt: '2026-07-06T09:00:00Z',
};

it('ActivityPanel — record event links to the record; record-less event is a static line', async () => {
  // Act
  const { container } = renderWithProviders(
    <ActivityPanel items={[recordEvent, recordlessEvent]} sinceLastSeenAt="2026-07-02T00:00:00Z" />,
  );

  // Assert — the record row is a link; the actor and header render; only one link (the record event).
  expect(screen.getByRole('link')).toHaveAttribute('href', '/requests/REQ-0899');
  expect(screen.getByText('M. Reyes')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: 'Since you were last here' })).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('ActivityPanel — empty — shows the empty note and the first-visit header', async () => {
  // Act
  const { container } = renderWithProviders(<ActivityPanel items={[]} sinceLastSeenAt={null} />);

  // Assert — the empty note and the first-visit header (exact string, so it matches only the meta span,
  // not the "No activity since your last visit." note which also contains the phrase).
  expect(screen.getByText('No activity since your last visit.')).toBeInTheDocument();
  expect(screen.getByText('Since your last visit')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});
