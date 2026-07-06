// Tests for PinnedStrip — renders the freshest pinned announcement + history link when present, and
// renders nothing when there are none. axe on the present state.

import { screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { HomePinnedAnnouncement } from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import { PinnedStrip } from './PinnedStrip';

expect.extend(toHaveNoViolations);

const pinned: HomePinnedAnnouncement = {
  announcementId: 'a1', title: 'Intake review moves', bodySnippet: 'Now on Fridays.', publishedAt: '2026-07-05T10:00:00Z',
};

it('PinnedStrip — with a pinned announcement — shows it and links to the history', async () => {
  // Act
  const { container } = renderWithProviders(<PinnedStrip announcements={[pinned]} />);

  // Assert
  expect(screen.getByText('Intake review moves')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Announcement history' })).toHaveAttribute('href', '/announcements');
  expect(await axe(container)).toHaveNoViolations();
});

it('PinnedStrip — none pinned — renders nothing', () => {
  // Act
  const { container } = renderWithProviders(<PinnedStrip announcements={[]} />);

  // Assert
  expect(container).toBeEmptyDOMElement();
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
});
