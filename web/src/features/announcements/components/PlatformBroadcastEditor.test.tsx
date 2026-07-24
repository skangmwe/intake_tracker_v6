// Tests for PlatformBroadcastEditor. Covers the field set (Title, Body, Status, Auto-archive, Pin), the
// target picker (All vs Specific → workspace checkbox list), edit mode hiding the target picker, submit
// validation (required title/body; specific-with-none; scheduled needs a future time), and axe on the
// create-all, create-specific (list open), validation-error, and edit states.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { PlatformAnnouncementRow, PlatformWorkspaceDto, WorkspaceId } from '@shared/types';

import { PlatformBroadcastEditor } from './PlatformBroadcastEditor';

expect.extend(toHaveNoViolations);

const WORKSPACES: PlatformWorkspaceDto[] = [
  { id: 'ws-1' as WorkspaceId, name: 'AI Solutions', kind: 'ai-solutions' },
  { id: 'ws-2' as WorkspaceId, name: 'Litigation', kind: 'pg-dept' },
];

const EDIT_ROW: PlatformAnnouncementRow = {
  broadcastId: 'b1',
  title: 'Firm notice',
  body: 'Existing body',
  pinned: true,
  status: 'Active',
  author: 'u1' as PlatformAnnouncementRow['author'],
  authorName: 'Platform Admin',
  postedAt: '2026-07-05T09:31:00Z',
  workspaceCount: 2,
};

function renderEditor(overrides: Partial<Parameters<typeof PlatformBroadcastEditor>[0]> = {}) {
  const onSubmit = jest.fn();
  const onClose = jest.fn();
  const utils = render(
    <PlatformBroadcastEditor
      mode="create"
      workspaces={WORKSPACES}
      submitting={false}
      onSubmit={onSubmit}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onSubmit, onClose, ...utils };
}

it('PlatformBroadcastEditor — create — shows the target picker and defaults to All workspaces', async () => {
  // Arrange + Act
  const { container } = renderEditor();

  // Assert
  expect(screen.getByRole('radio', { name: 'All workspaces' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Specific workspaces' })).not.toBeChecked();
  expect(await axe(container)).toHaveNoViolations();
});

it('PlatformBroadcastEditor — specific — reveals the workspace checkbox list', async () => {
  // Arrange
  const user = userEvent.setup();
  const { container } = renderEditor();

  // Act
  await user.click(screen.getByRole('radio', { name: 'Specific workspaces' }));

  // Assert
  expect(screen.getByRole('checkbox', { name: 'AI Solutions' })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Litigation' })).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('PlatformBroadcastEditor — post to all — submits a title/body with an all target', async () => {
  // Arrange
  const user = userEvent.setup();
  const { onSubmit } = renderEditor();

  // Act
  await user.type(screen.getByLabelText('Title'), 'Downtime');
  await user.type(screen.getByLabelText('Body'), 'Systems back at 5pm');
  await user.click(screen.getByRole('button', { name: 'Post' }));

  // Assert
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({
      title: 'Downtime',
      body: 'Systems back at 5pm',
      target: { kind: 'all' },
    }),
  );
});

it('PlatformBroadcastEditor — post to specific — submits the selected workspace ids', async () => {
  // Arrange
  const user = userEvent.setup();
  const { onSubmit } = renderEditor();

  // Act
  await user.type(screen.getByLabelText('Title'), 'PG notice');
  await user.type(screen.getByLabelText('Body'), 'For litigation only');
  await user.click(screen.getByRole('radio', { name: 'Specific workspaces' }));
  await user.click(screen.getByRole('checkbox', { name: 'Litigation' }));
  await user.click(screen.getByRole('button', { name: 'Post' }));

  // Assert
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ target: { kind: 'specific', workspaceIds: ['ws-2'] } }),
  );
});

it('PlatformBroadcastEditor — specific with none selected — blocks submit with an error', async () => {
  // Arrange
  const user = userEvent.setup();
  const { onSubmit, container } = renderEditor();

  // Act
  await user.type(screen.getByLabelText('Title'), 'Notice');
  await user.type(screen.getByLabelText('Body'), 'Body');
  await user.click(screen.getByRole('radio', { name: 'Specific workspaces' }));
  await user.click(screen.getByRole('button', { name: 'Post' }));

  // Assert
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText('Select at least one workspace to post to.')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('PlatformBroadcastEditor — missing title and body — blocks submit', async () => {
  // Arrange
  const user = userEvent.setup();
  const { onSubmit } = renderEditor();

  // Act
  await user.click(screen.getByRole('button', { name: 'Post' }));

  // Assert
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText('Add a title so people know what this is about.')).toBeInTheDocument();
});

it('PlatformBroadcastEditor — edit — prefills, hides the target picker, and offers Retire', async () => {
  // Arrange + Act
  const onRetire = jest.fn();
  const { container } = renderEditor({ mode: 'edit', initial: EDIT_ROW, onRetire });

  // Assert
  expect(screen.getByLabelText('Title')).toHaveValue('Firm notice');
  expect(screen.getByLabelText('Body')).toHaveValue('Existing body');
  expect(screen.queryByRole('radio', { name: 'All workspaces' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retire now' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('PlatformBroadcastEditor — scheduled needs a future date', async () => {
  // Arrange
  const user = userEvent.setup();
  const { onSubmit } = renderEditor();

  // Act
  await user.type(screen.getByLabelText('Title'), 'Later');
  await user.type(screen.getByLabelText('Body'), 'Body');
  await user.selectOptions(screen.getByLabelText('Status'), 'Scheduled');
  await user.click(screen.getByRole('button', { name: 'Post' }));

  // Assert — a Scheduled post with no date is blocked.
  expect(onSubmit).not.toHaveBeenCalled();
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText('Choose when this announcement should publish.')).toBeInTheDocument();
});
