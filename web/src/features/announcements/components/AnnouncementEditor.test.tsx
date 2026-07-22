// Tests for AnnouncementEditor (S23), reconciled to the prototype. Covers the field set (Title, Body,
// Posted by, Status, Auto-archive, Pin), the Scheduled → date-time reveal, submit validation (required
// title/body; a Scheduled announcement needs a future date), the create vs edit labels, the auto-archive
// helper copy, and axe on the default / scheduled / error states.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { AnnouncementDto, UserId, WorkspaceId } from '@shared/types';

import type { SelectOption } from '@/shared/components/Form';

import { AnnouncementEditor } from './AnnouncementEditor';

expect.extend(toHaveNoViolations);

const AUTHOR_OPTIONS: SelectOption[] = [
  { value: 'u1', label: 'Priya Raman' },
  { value: 'u2', label: 'S. Boyd' },
];
const DEFAULT_AUTHOR = 'u1' as UserId;

const INITIAL: AnnouncementDto = {
  id: 'a1' as AnnouncementDto['id'],
  workspaceId: 'ws-1' as WorkspaceId,
  title: 'Coverage news',
  body: 'Existing body',
  audience: { kind: 'everyone' },
  pinned: true,
  status: 'Active',
  author: 'u2' as UserId,
  createdAt: '2026-07-05T10:00:00Z',
  updatedAt: '2026-07-05T10:00:00Z',
  publishedAt: '2026-07-05T10:00:00Z',
  autoArchive: true,
};

function renderEditor(overrides: Partial<Parameters<typeof AnnouncementEditor>[0]> = {}) {
  const onSubmit = jest.fn();
  const onClose = jest.fn();
  const utils = render(
    <AnnouncementEditor
      mode="create"
      authorOptions={AUTHOR_OPTIONS}
      defaultAuthor={DEFAULT_AUTHOR}
      submitting={false}
      onSubmit={onSubmit}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onSubmit, onClose, ...utils };
}

describe('AnnouncementEditor', () => {
  it('AnnouncementEditor — create — renders the prototype field set with an Add action', () => {
    // Arrange / Act
    renderEditor();

    // Assert
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Body')).toBeInTheDocument();
    expect(screen.getByLabelText('Posted by')).toHaveValue('u1');
    expect(screen.getByLabelText('Status')).toHaveValue('Active');
    expect(screen.getByLabelText('Auto-archive after 30 days')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    // Active hides the publish date-time field.
    expect(screen.queryByLabelText('Publish date & time')).not.toBeInTheDocument();
  });

  it('AnnouncementEditor — auto-archive helper reflects the toggle', async () => {
    // Arrange
    const user = userEvent.setup();
    renderEditor();

    // Assert — on by default
    expect(screen.getByText(/Automatically moves to Archived on/)).toBeInTheDocument();

    // Act — turn it off
    await user.click(screen.getByLabelText('Auto-archive after 30 days'));

    // Assert
    expect(screen.getByText('Stays visible until archived manually.')).toBeInTheDocument();
  });

  it('AnnouncementEditor — selecting Scheduled reveals the publish date-time field', async () => {
    // Arrange
    const user = userEvent.setup();
    renderEditor();

    // Act
    await user.selectOptions(screen.getByLabelText('Status'), 'Scheduled');

    // Assert
    expect(screen.getByLabelText('Publish date & time')).toBeInTheDocument();
  });

  it('AnnouncementEditor — missing title and body block submit with field errors', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onSubmit } = renderEditor();

    // Act
    await user.click(screen.getByRole('button', { name: 'Add' }));

    // Assert
    expect(screen.getByText('Add a title so people know what this is about.')).toBeInTheDocument();
    expect(screen.getByText('Add the announcement text.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('AnnouncementEditor — Scheduled without a future date is rejected', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onSubmit } = renderEditor();
    await user.type(screen.getByLabelText('Title'), 'Freeze');
    await user.type(screen.getByLabelText('Body'), 'Body');
    await user.selectOptions(screen.getByLabelText('Status'), 'Scheduled');

    // Act — a past date fails the future check
    await user.type(screen.getByLabelText('Publish date & time'), '2020-01-01T09:00');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    // Assert
    expect(screen.getByText('Pick a date and time in the future.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('AnnouncementEditor — valid create emits the editor value', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onSubmit } = renderEditor();

    // Act
    await user.type(screen.getByLabelText('Title'), 'Fresh notice');
    await user.type(screen.getByLabelText('Body'), 'Body text');
    await user.selectOptions(screen.getByLabelText('Posted by'), 'u2');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    // Assert
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Fresh notice',
        body: 'Body text',
        author: 'u2',
        status: 'Active',
        autoArchive: true,
        pinned: false,
      }),
    );
  });

  it('AnnouncementEditor — edit — prefills from the DTO and labels the action Save changes', () => {
    // Arrange / Act
    renderEditor({ mode: 'edit', initial: INITIAL });

    // Assert
    expect(screen.getByLabelText('Title')).toHaveValue('Coverage news');
    expect(screen.getByLabelText('Posted by')).toHaveValue('u2');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Pin to the top of Home/ })).toBeChecked();
  });

  it('AnnouncementEditor — surfaces the API error message', () => {
    // Arrange / Act
    renderEditor({ errorMessage: 'That poster is not a member of this workspace.' });

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(
      'That poster is not a member of this workspace.',
    );
  });

  it('AnnouncementEditor — no axe violations across default, scheduled, and error states', async () => {
    // Arrange / Act — default
    const base = renderEditor();
    // Assert
    expect(await axe(base.container)).toHaveNoViolations();
    base.unmount();

    // Act — scheduled (date-time revealed)
    const user = userEvent.setup();
    const scheduled = renderEditor();
    await user.selectOptions(screen.getByLabelText('Status'), 'Scheduled');
    // Assert
    expect(await axe(scheduled.container)).toHaveNoViolations();
    scheduled.unmount();

    // Act — error state
    const errored = renderEditor({
      errorMessage: 'Something went wrong on our end. Try again in a moment.',
    });
    // Assert
    expect(within(errored.baseElement).getByRole('alert')).toBeInTheDocument();
    expect(await axe(errored.container)).toHaveNoViolations();
  });
});
