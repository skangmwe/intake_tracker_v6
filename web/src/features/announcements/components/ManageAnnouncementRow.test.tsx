// Tests for ManageAnnouncementRow — action visibility by status (Publish only for Draft; Retire for
// anything not Retired; Edit disabled once Retired), the row actions, and jest-axe across statuses.

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { AnnouncementListRow, AnnouncementStatus } from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import { ManageAnnouncementRow } from './ManageAnnouncementRow';

expect.extend(toHaveNoViolations);

function row(status: AnnouncementStatus, overrides: Partial<AnnouncementListRow> = {}): AnnouncementListRow {
  return {
    id: 'a1' as AnnouncementListRow['id'],
    title: 'Coverage news',
    bodySnippet: 'Preview',
    pinned: false,
    status,
    author: 'u1' as AnnouncementListRow['author'],
    ...overrides,
  };
}

function renderRow(status: AnnouncementStatus, overrides: Partial<AnnouncementListRow> = {}) {
  const onEdit = jest.fn();
  const onPublish = jest.fn();
  const onRetire = jest.fn();
  const utils = renderWithProviders(
    <ul>
      <ManageAnnouncementRow row={row(status, overrides)} busy={false} onEdit={onEdit} onPublish={onPublish} onRetire={onRetire} />
    </ul>,
  );
  return { onEdit, onPublish, onRetire, ...utils };
}

it('ManageAnnouncementRow — draft — shows Publish, Retire, Edit and a pinned marker', async () => {
  // Act
  const { container } = renderRow('Draft', { pinned: true });

  // Assert
  expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retire' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled();
  expect(screen.getByText('Pinned')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Preview' })).toHaveAttribute('href', '/announcements/a1');
  expect(await axe(container)).toHaveNoViolations();
});

it('ManageAnnouncementRow — published — hides Publish but keeps Retire', () => {
  // Act
  renderRow('Published');

  // Assert
  expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retire' })).toBeInTheDocument();
});

it('ManageAnnouncementRow — retired — disables Edit and hides Publish/Retire', async () => {
  // Act
  const { container } = renderRow('Retired');

  // Assert
  expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retire' })).not.toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('ManageAnnouncementRow — actions — invoke the callbacks with the row id', async () => {
  // Arrange
  const user = userEvent.setup();
  const { onEdit, onPublish, onRetire } = renderRow('Draft');

  // Act
  await user.click(screen.getByRole('button', { name: 'Edit' }));
  await user.click(screen.getByRole('button', { name: 'Publish' }));
  await user.click(screen.getByRole('button', { name: 'Retire' }));

  // Assert
  expect(onEdit).toHaveBeenCalledWith('a1');
  expect(onPublish).toHaveBeenCalledWith('a1');
  expect(onRetire).toHaveBeenCalledWith('a1');
});
