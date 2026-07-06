// UsersAccessPage — the S29 surface. Covers the WorkspaceAdmin gate, the loaded / empty / members-
// loading / members-error / no-workspace states, and the deactivate dialog flow. jest-axe runs
// against each meaningfully different rendered state (web-testing.md accessibility requirement).
// The api module is mocked at the boundary; /users/me is seeded so the shell resolves without network.

import { axe } from 'jest-axe';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { MeDto } from '@shared/types';

import { buildMe, buildMember, buildMembership, renderWithProviders } from '@/test-utils';

import { deactivateMember, fetchMe, fetchMembers } from '../api';
import { UsersAccessPage } from './UsersAccessPage';

jest.mock('../api');
const mockedFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;
const mockedFetchMembers = fetchMembers as jest.MockedFunction<typeof fetchMembers>;
const mockedDeactivate = deactivateMember as jest.MockedFunction<typeof deactivateMember>;

const adminMe = () => buildMe({ memberships: [buildMembership({ level: 'WorkspaceAdmin' })] });
const memberMe = () => buildMe({ memberships: [buildMembership({ level: 'Member' })] });

// Seed /users/me AND back it with a resolving fetchMe: the seeded query is stale on mount, so
// React Query refetches — with `../api` mocked, an unset fetchMe would resolve to undefined and
// error the query. Resolving it with the same `me` keeps the caller signed-in through the test.
function renderPage(me: MeDto) {
  mockedFetchMe.mockResolvedValue(me);
  return renderWithProviders(<UsersAccessPage />, { seedMe: me });
}

beforeEach(() => jest.clearAllMocks());

describe('UsersAccessPage', () => {
  it('renders the members table for a workspace admin', async () => {
    // Arrange
    mockedFetchMembers.mockResolvedValue({ members: [buildMember({ displayName: 'Ada Byron' })] });

    // Act
    const { container } = renderPage(adminMe());

    // Assert
    expect(await screen.findByText('Ada Byron')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the empty message when the workspace has no members', async () => {
    // Arrange
    mockedFetchMembers.mockResolvedValue({ members: [] });

    // Act
    const { container } = renderPage(adminMe());

    // Assert
    expect(await screen.findByText(/no members yet/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows a warning and no add form for a non-admin', async () => {
    // Arrange
    mockedFetchMembers.mockResolvedValue({ members: [] });

    // Act
    const { container } = renderPage(memberMe());

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(/available to workspace admins/i);
    expect(screen.queryByRole('form', { name: /add a member/i })).not.toBeInTheDocument();
    expect(mockedFetchMembers).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows an error when no workspace can be resolved', async () => {
    // Act
    const { container } = renderPage(buildMe({ memberships: [] }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the members-loading state while the list is in flight', async () => {
    // Arrange — a never-resolving fetch keeps the list pending.
    mockedFetchMembers.mockReturnValue(new Promise(() => undefined));

    // Act
    const { container } = renderPage(adminMe());

    // Assert
    expect(await screen.findByText(/loading members…/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the members-error state when the list fails', async () => {
    // Arrange
    mockedFetchMembers.mockRejectedValue(new Error('boom'));

    // Act
    const { container } = renderPage(adminMe());

    // Assert
    expect(await screen.findByText(/member list could not be loaded/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('opens the deactivate dialog and deactivates the member', async () => {
    // Arrange
    mockedFetchMembers.mockResolvedValue({ members: [buildMember({ displayName: 'Ada Byron' })] });
    mockedDeactivate.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage(adminMe());
    await screen.findByText('Ada Byron');

    // Act — open the confirm dialog, then confirm.
    await user.click(screen.getByRole('button', { name: /^deactivate$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Deactivate Ada Byron' }));

    // Assert
    await waitFor(() => expect(mockedDeactivate).toHaveBeenCalledTimes(1));
    expect(dialog).not.toBeInTheDocument();
  });
});
