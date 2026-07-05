// Tests for AnnouncementEditor — validation, audience-kind switching, the pin toggle, edit-mode
// prefill, and the error alert. jest-axe on the default + role-scoped + error states (web-testing.md,
// accessibility.md).

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { AnnouncementDto, UserId, WorkspaceId } from '@shared/types';

import { AnnouncementEditor } from './AnnouncementEditor';

expect.extend(toHaveNoViolations);

const EDIT_INITIAL: AnnouncementDto = {
  id: 'a1' as unknown as AnnouncementDto['id'],
  workspaceId: 'w1' as WorkspaceId,
  title: 'Existing notice',
  body: 'Existing body',
  audience: { kind: 'role-scoped', roleLabels: ['Manager'] },
  pinned: true,
  status: 'Draft',
  author: 'u1' as UserId,
  createdAt: '2026-07-05T10:00:00Z',
  updatedAt: '2026-07-05T10:00:00Z',
};

function renderEditor(overrides: Partial<Parameters<typeof AnnouncementEditor>[0]> = {}) {
  const onSubmit = jest.fn();
  const onClose = jest.fn();
  const utils = render(
    <AnnouncementEditor mode="create" submitting={false} onSubmit={onSubmit} onClose={onClose} {...overrides} />,
  );
  return { onSubmit, onClose, ...utils };
}

it('AnnouncementEditor — empty title and body — blocks submit with field errors', async () => {
  // Arrange
  const user = userEvent.setup();
  const { onSubmit } = renderEditor();

  // Act
  await user.click(screen.getByRole('button', { name: 'Save draft' }));

  // Assert
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText('Add a title so people know what this is about.')).toBeInTheDocument();
  expect(screen.getByText('Add the announcement text.')).toBeInTheDocument();
});

it('AnnouncementEditor — valid everyone audience — submits the built value', async () => {
  // Arrange
  const user = userEvent.setup();
  const { onSubmit } = renderEditor();

  // Act
  await user.type(screen.getByLabelText('Title'), 'Coverage news');
  await user.type(screen.getByLabelText('Body'), 'The details');
  await user.click(screen.getByRole('button', { name: 'Save draft' }));

  // Assert
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'Coverage news', body: 'The details', audience: { kind: 'everyone' }, pinned: false }),
  );
});

it('AnnouncementEditor — role-scoped without roles — shows an audience error', async () => {
  // Arrange
  const user = userEvent.setup();
  const { onSubmit } = renderEditor();

  // Act
  await user.type(screen.getByLabelText('Title'), 'For managers');
  await user.type(screen.getByLabelText('Body'), 'Body');
  await user.selectOptions(screen.getByLabelText('Audience'), 'role-scoped');
  await user.click(screen.getByRole('button', { name: 'Save draft' }));

  // Assert — the Roles field appeared and the audience error blocks submit.
  expect(screen.getByLabelText('Roles')).toBeInTheDocument();
  expect(screen.getByText('List at least one role for a role-scoped audience.')).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
});

it('AnnouncementEditor — role-scoped with roles — submits the role list', async () => {
  // Arrange
  const user = userEvent.setup();
  const { onSubmit } = renderEditor();

  // Act
  await user.type(screen.getByLabelText('Title'), 'For managers');
  await user.type(screen.getByLabelText('Body'), 'Body');
  await user.selectOptions(screen.getByLabelText('Audience'), 'role-scoped');
  await user.type(screen.getByLabelText('Roles'), 'Manager, PG Lead');
  await user.click(screen.getByRole('button', { name: 'Save draft' }));

  // Assert
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ audience: { kind: 'role-scoped', roleLabels: ['Manager', 'PG Lead'] } }),
  );
});

it('AnnouncementEditor — pin toggle — carries into the submitted value', async () => {
  // Arrange
  const user = userEvent.setup();
  const { onSubmit } = renderEditor();

  // Act
  await user.type(screen.getByLabelText('Title'), 'Pinned notice');
  await user.type(screen.getByLabelText('Body'), 'Body');
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Save draft' }));

  // Assert
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ pinned: true }));
});

it('AnnouncementEditor — edit mode — prefills from the initial announcement', () => {
  // Arrange + Act
  renderEditor({ mode: 'edit', initial: EDIT_INITIAL });

  // Assert
  expect(screen.getByLabelText('Title')).toHaveValue('Existing notice');
  expect(screen.getByLabelText('Roles')).toHaveValue('Manager');
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
});

it('AnnouncementEditor — cancel — calls onClose', async () => {
  // Arrange
  const user = userEvent.setup();
  const { onClose } = renderEditor();

  // Act
  await user.click(screen.getByRole('button', { name: 'Cancel' }));

  // Assert
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('AnnouncementEditor — error message — renders an alert', () => {
  // Arrange + Act
  renderEditor({ errorMessage: 'A retired announcement cannot be published.' });

  // Assert
  expect(screen.getByRole('alert')).toHaveTextContent('A retired announcement cannot be published.');
});

it('AnnouncementEditor — no axe violations (default, role-scoped, error)', async () => {
  // Arrange
  const user = userEvent.setup();
  const { container, rerender } = renderEditor({ errorMessage: 'Something went wrong.' });

  // Assert — error state
  expect(await axe(container)).toHaveNoViolations();

  // Act + Assert — role-scoped state
  rerender(<AnnouncementEditor mode="create" submitting={false} onSubmit={jest.fn()} onClose={jest.fn()} />);
  await user.selectOptions(screen.getByLabelText('Audience'), 'role-scoped');
  expect(await axe(container)).toHaveNoViolations();
});
