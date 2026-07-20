// UsersAccessPage — the S29 surface shell. Covers the WorkspaceAdmin gate, the me-loading and
// no-workspace states, the Members / Approver teams tab bar, and switching to the read-only
// approver-teams panel. jest-axe runs against each meaningfully different rendered state
// (web-testing.md accessibility requirement). Member-list behaviour lives in MembersPanel.test.tsx;
// here the api and the lifecycle-config read are mocked at their boundaries.

import { axe } from 'jest-axe';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UseQueryResult } from '@tanstack/react-query';

import type { LifecycleConfigDto, MeDto, UserId } from '@shared/types';

import { buildLifecycleConfig, buildMe, buildMember, buildMembership, renderWithProviders } from '@/test-utils';

import { useLifecycleConfig } from '@/features/lifecycle';

import { fetchMe, fetchMembers } from '../api';
import { UsersAccessPage } from './UsersAccessPage';

jest.mock('../api');
jest.mock('@/features/lifecycle', () => ({ useLifecycleConfig: jest.fn() }));

const mockedFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;
const mockedFetchMembers = fetchMembers as jest.MockedFunction<typeof fetchMembers>;
const mockedConfig = useLifecycleConfig as jest.MockedFunction<typeof useLifecycleConfig>;

const adminMe = () => buildMe({ memberships: [buildMembership({ level: 'WorkspaceAdmin' })] });
const memberMe = () => buildMe({ memberships: [buildMembership({ level: 'Member' })] });

// The panel reads only data / isLoading / isError; a partial stub suffices (the real result union has
// ~20 members we don't set).
function configStub(partial: Partial<UseQueryResult<LifecycleConfigDto>>): UseQueryResult<LifecycleConfigDto> {
  return partial as UseQueryResult<LifecycleConfigDto>;
}

// Seed /users/me AND back it with a resolving fetchMe: the seeded query is stale on mount, so React
// Query refetches — with `../api` mocked, an unset fetchMe would resolve to undefined and error.
function renderPage(me: MeDto) {
  mockedFetchMe.mockResolvedValue(me);
  return renderWithProviders(<UsersAccessPage />, { seedMe: me });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedConfig.mockReturnValue(configStub({ data: undefined, isLoading: true, isError: false }));
});

describe('UsersAccessPage', () => {
  it('UsersAccessPage — admin — renders the tab bar and the Members list by default', async () => {
    // Arrange
    mockedFetchMembers.mockResolvedValue({ members: [buildMember({ displayName: 'Ada Byron' })] });

    // Act
    const { container } = renderPage(adminMe());

    // Assert
    expect(await screen.findByText('Ada Byron')).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: /users and access sections/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Members' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Approver teams' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('UsersAccessPage — non-admin — shows a warning and no tabs', async () => {
    // Act
    const { container } = renderPage(memberMe());

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(/available to workspace admins/i);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(mockedFetchMembers).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('UsersAccessPage — no workspace resolvable — shows an error', async () => {
    // Act
    const { container } = renderPage(buildMe({ memberships: [] }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('UsersAccessPage — me loading — shows the loading state', async () => {
    // Arrange — never-resolving me keeps the shell pending.
    mockedFetchMe.mockReturnValue(new Promise(() => undefined));

    // Act
    const { container } = renderWithProviders(<UsersAccessPage />);

    // Assert
    expect(await screen.findByText(/^loading…$/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('UsersAccessPage — Approver teams tab — switches to the read-only roster', async () => {
    // Arrange
    mockedFetchMembers.mockResolvedValue({ members: [buildMember({ displayName: 'Ada Byron' })] });
    mockedConfig.mockReturnValue(
      configStub({
        data: buildLifecycleConfig({
          approverTeams: [
            { roleLabel: 'GCO', members: [{ userId: '00000000-0000-0000-0000-0000000000a1' as UserId, displayName: 'Bo Chen' }] },
          ],
        }),
        isLoading: false,
        isError: false,
      }),
    );
    const user = userEvent.setup();
    renderPage(adminMe());
    await screen.findByText('Ada Byron');

    // Act
    await user.click(screen.getByRole('tab', { name: 'Approver teams' }));

    // Assert
    expect(await screen.findByText('GCO')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /manage teams/i })).toHaveAttribute('href', '/admin/lifecycle');
    expect(screen.queryByText('Ada Byron')).not.toBeInTheDocument();
  });
});
