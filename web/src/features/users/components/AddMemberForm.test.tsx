// AddMemberForm — submits an email + level. A known user joins now (outcome Member → clears and
// closes); an unknown email is invited (outcome Invited → confirmation notice, form stays open);
// ambiguous names surface the API's 400 message. jest-axe runs against the default, error, and
// invited-notice states (web-testing.md accessibility requirement).

import { axe } from 'jest-axe';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { WorkspaceId } from '@shared/types';

import { ApiError } from '@/shared/http/apiClient';
import { renderWithProviders } from '@/test-utils';

import { upsertMember } from '../api';
import { AddMemberForm } from './AddMemberForm';

jest.mock('../api');
const mockedUpsert = upsertMember as jest.MockedFunction<typeof upsertMember>;

const WORKSPACE = '1a150000-0000-4000-8000-000000000001' as WorkspaceId;

function badRequest(detail: string): ApiError {
  return new ApiError(400, { type: 't', title: 'Bad', status: 400, detail });
}

beforeEach(() => jest.clearAllMocks());

describe('AddMemberForm', () => {
  it('submits the trimmed email and selected level, then clears the field', async () => {
    // Arrange
    mockedUpsert.mockResolvedValue({ outcome: 'Member' });
    const user = userEvent.setup();
    renderWithProviders(<AddMemberForm workspaceId={WORKSPACE} />);
    const email = screen.getByLabelText(/member email/i);

    // Act
    await user.type(email, '  colleague@mws.ai  ');
    await user.selectOptions(screen.getByLabelText(/access level/i), 'WorkspaceAdmin');
    await user.click(screen.getByRole('button', { name: /add member/i }));

    // Assert
    await waitFor(() =>
      expect(mockedUpsert).toHaveBeenCalledWith(WORKSPACE, {
        email: 'colleague@mws.ai',
        level: 'WorkspaceAdmin',
      }),
    );
    await waitFor(() => expect(email).toHaveValue(''));
  });

  it('submits on Enter from the email field (implicit form submission)', async () => {
    // Arrange
    mockedUpsert.mockResolvedValue({ outcome: 'Member' });
    const onClose = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(<AddMemberForm workspaceId={WORKSPACE} onClose={onClose} />);

    // Act — pressing Enter in the email field submits the form without clicking the button.
    await user.type(screen.getByLabelText(/member email/i), 'colleague@mws.ai{Enter}');

    // Assert
    await waitFor(() =>
      expect(mockedUpsert).toHaveBeenCalledWith(WORKSPACE, {
        email: 'colleague@mws.ai',
        level: 'Member',
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('renders a Cancel button and closes on a successful add when onClose is provided', async () => {
    // Arrange
    mockedUpsert.mockResolvedValue({ outcome: 'Member' });
    const onClose = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(<AddMemberForm workspaceId={WORKSPACE} onClose={onClose} />);

    // Act — Cancel closes without submitting.
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockedUpsert).not.toHaveBeenCalled();

    // Act — a successful add also closes.
    await user.type(screen.getByLabelText(/member email/i), 'colleague@mws.ai');
    await user.click(screen.getByRole('button', { name: /add member/i }));
    // Assert
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
  });

  it('confirms an invitation and keeps the form open when the email is unknown', async () => {
    // Arrange — an unknown email returns outcome Invited; the form must confirm it, not close.
    mockedUpsert.mockResolvedValue({ outcome: 'Invited' });
    const onClose = jest.fn();
    const user = userEvent.setup();
    const { container } = renderWithProviders(<AddMemberForm workspaceId={WORKSPACE} onClose={onClose} />);

    // Act
    await user.type(screen.getByLabelText(/member email/i), 'newcomer@mws.ai');
    await user.click(screen.getByRole('button', { name: /add member/i }));

    // Assert — a status confirmation names the invitee; the form stays open.
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent(/invited newcomer@mws\.ai/i);
    expect(onClose).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the API message when the email cannot be resolved', async () => {
    // Arrange
    mockedUpsert.mockRejectedValue(badRequest('No active user matches that name or email.'));
    const user = userEvent.setup();
    const { container } = renderWithProviders(<AddMemberForm workspaceId={WORKSPACE} />);

    // Act
    await user.type(screen.getByLabelText(/member email/i), 'nobody@mws.ai');
    await user.click(screen.getByRole('button', { name: /add member/i }));

    // Assert
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/no active user matches/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in the default state', async () => {
    // Arrange
    const { container } = renderWithProviders(<AddMemberForm workspaceId={WORKSPACE} />);

    // Assert
    expect(await axe(container)).toHaveNoViolations();
  });
});
