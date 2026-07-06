// AccessPage (S36) — the platform-admin gate + directory, grant, and revoke flows. jest-axe runs
// against each meaningfully different rendered state (web-testing.md). Covers GrantAccessForm,
// PrivilegedGrantsTable, and RevokeGrantDialog through the page.

import { axe } from 'jest-axe';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { MeDto, PrivilegedGrantDto, UserId, WorkspaceId } from '@shared/types';

import { buildMe, renderWithProviders } from '@/test-utils';
import { fetchMe } from '@/features/users/api';

import { fetchAccessGrants, grantAccess, revokeAccess } from '../api';
import { AccessPage } from './AccessPage';

jest.mock('../api');
jest.mock('@/features/users/api');
const mockedFetch = fetchAccessGrants as jest.MockedFunction<typeof fetchAccessGrants>;
const mockedGrant = grantAccess as jest.MockedFunction<typeof grantAccess>;
const mockedRevoke = revokeAccess as jest.MockedFunction<typeof revokeAccess>;
const mockedFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;

const adminMe = () => buildMe({ isPlatformAdmin: true });

const platformGrant = (over: Partial<PrivilegedGrantDto> = {}): PrivilegedGrantDto => ({
  grantKind: 'PlatformAdmin',
  userId: '00000000-0000-4000-8000-0000000000aa' as UserId,
  displayName: 'Dana Admin',
  email: 'dana@mws.ai',
  workspaceId: null,
  workspaceName: null,
  grantedAt: '2026-07-01T10:00:00Z',
  ...over,
});

const workspaceGrant = (): PrivilegedGrantDto => ({
  grantKind: 'WorkspaceAdmin',
  userId: '00000000-0000-4000-8000-0000000000bb' as UserId,
  displayName: 'Wendy Workspace',
  email: 'wendy@mws.ai',
  workspaceId: 'ws-9' as WorkspaceId,
  workspaceName: 'Litigation',
  grantedAt: '2026-07-02T10:00:00Z',
});

function renderPage(me: MeDto) {
  mockedFetchMe.mockResolvedValue(me);
  return renderWithProviders(<AccessPage />, { seedMe: me });
}

beforeEach(() => jest.clearAllMocks());

describe('AccessPage', () => {
  it('renders the privileged-grants directory for a platform admin', async () => {
    mockedFetch.mockResolvedValue({ grants: [platformGrant(), workspaceGrant()] });
    const { container } = renderPage(adminMe());
    expect(await screen.findByText('Dana Admin')).toBeInTheDocument();
    expect(screen.getByText('Wendy Workspace')).toBeInTheDocument();
    // Only the platform grant is revocable here.
    expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(1);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the empty state when there are no grants', async () => {
    mockedFetch.mockResolvedValue({ grants: [] });
    const { container } = renderPage(adminMe());
    expect(await screen.findByText(/no privileged grants yet/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the error state when the directory fails', async () => {
    mockedFetch.mockRejectedValue(new Error('boom'));
    const { container } = renderPage(adminMe());
    expect(await screen.findByText(/directory could not be loaded/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('grants platform admin by email', async () => {
    mockedFetch.mockResolvedValue({ grants: [] });
    mockedGrant.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage(adminMe());
    await screen.findByText(/no privileged grants yet/i);

    await user.type(screen.getByLabelText(/colleague email/i), 'new@mws.ai');
    await user.click(screen.getByRole('button', { name: /grant platform admin/i }));

    await waitFor(() => expect(mockedGrant).toHaveBeenCalledWith({ email: 'new@mws.ai' }));
  });

  it('opens the revoke dialog and revokes the grant', async () => {
    mockedFetch.mockResolvedValue({ grants: [platformGrant()] });
    mockedRevoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage(adminMe());
    await screen.findByText('Dana Admin');

    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    const dialog = await screen.findByRole('dialog');
    expect(await axe(dialog)).toHaveNoViolations();
    await user.click(screen.getByRole('button', { name: 'Revoke Dana Admin' }));

    await waitFor(() => expect(mockedRevoke).toHaveBeenCalledWith(platformGrant().userId));
  });
});
