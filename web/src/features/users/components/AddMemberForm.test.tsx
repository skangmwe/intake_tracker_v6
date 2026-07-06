// AddMemberForm — submits an email + level, surfaces the API's 400 message, clears on success.
// jest-axe runs against the default and error states (web-testing.md accessibility requirement).

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
    mockedUpsert.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<AddMemberForm workspaceId={WORKSPACE} />);
    const email = screen.getByLabelText(/member email/i);

    // Act
    await user.type(email, '  colleague@mws.ai  ');
    await user.selectOptions(screen.getByLabelText(/^level$/i), 'WorkspaceAdmin');
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
