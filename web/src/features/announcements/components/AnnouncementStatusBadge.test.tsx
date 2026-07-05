// Tests for AnnouncementStatusBadge — each status maps to the right label; axe on each.

import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { AnnouncementStatus } from '@shared/types';

import { AnnouncementStatusBadge } from './AnnouncementStatusBadge';

expect.extend(toHaveNoViolations);

it.each<[AnnouncementStatus, string]>([
  ['Draft', 'Draft'],
  ['Published', 'Published'],
  ['Retired', 'Retired'],
])('AnnouncementStatusBadge — %s — renders the label with no axe violations', async (status, label) => {
  // Act
  const { container } = render(<AnnouncementStatusBadge status={status} />);

  // Assert
  expect(screen.getByText(label)).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});
