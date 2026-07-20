// MembersPanel — the S29 Members tab: the membership list plus the collapsible add-member flow and
// the deactivate dialog. The api module is mocked at the boundary; the panel is driven through its
// loading / error / empty / list states, the ADD MEMBER toggle, and the deactivate flow. jest-axe
// runs against each meaningfully different rendered state (web-testing.md accessibility requirement).

import { axe } from 'jest-axe';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { buildInvitation, buildMember, buildMembership, renderWithProviders } from '@/test-utils';

import { cancelInvitation, deactivateMember, fetchMembers } from '../api';
import { MembersPanel } from './MembersPanel';

jest.mock('../api');
const mockedFetchMembers = fetchMembers as jest.MockedFunction<typeof fetchMembers>;
const mockedDeactivate = deactivateMember as jest.MockedFunction<typeof deactivateMember>;
const mockedCancelInvitation = cancelInvitation as jest.MockedFunction<typeof cancelInvitation>;

const workspaceId = buildMembership().workspaceId;

beforeEach(() => jest.clearAllMocks());

describe('MembersPanel', () => {
  it('MembersPanel — admin with members — renders the list', async () => {
    // Arrange
    mockedFetchMembers.mockResolvedValue({ members: [buildMember({ displayName: 'Ada Byron' })] });

    // Act
    const { container } = renderWithProviders(<MembersPanel workspaceId={workspaceId} />);

    // Assert
    expect(await screen.findByText('Ada Byron')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('MembersPanel — empty workspace — shows the empty message', async () => {
    // Arrange
    mockedFetchMembers.mockResolvedValue({ members: [] });

    // Act
    const { container } = renderWithProviders(<MembersPanel workspaceId={workspaceId} />);

    // Assert
    expect(await screen.findByText(/no members yet/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('MembersPanel — list in flight — shows the loading state', async () => {
    // Arrange — a never-resolving fetch keeps the list pending.
    mockedFetchMembers.mockReturnValue(new Promise(() => undefined));

    // Act
    const { container } = renderWithProviders(<MembersPanel workspaceId={workspaceId} />);

    // Assert
    expect(await screen.findByText(/loading members…/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('MembersPanel — list fails — shows the error state', async () => {
    // Arrange
    mockedFetchMembers.mockRejectedValue(new Error('boom'));

    // Act
    renderWithProviders(<MembersPanel workspaceId={workspaceId} />);

    // Assert
    expect(await screen.findByText(/member list could not be loaded/i)).toBeInTheDocument();
  });

  it('MembersPanel — ADD MEMBER toggles the add form open and closed', async () => {
    // Arrange
    mockedFetchMembers.mockResolvedValue({ members: [] });
    const user = userEvent.setup();
    const { container } = renderWithProviders(<MembersPanel workspaceId={workspaceId} />);
    await screen.findByText(/no members yet/i);
    const toggle = screen.getByRole('button', { name: /add member/i });

    // Act — open
    await user.click(toggle);

    // Assert — form visible, toggle expanded
    expect(screen.getByRole('form', { name: /add a member/i })).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await axe(container)).toHaveNoViolations();

    // Act — close via Cancel
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    // Assert — form gone
    expect(screen.queryByRole('form', { name: /add a member/i })).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('MembersPanel — Deactivate then Cancel — closes the dialog without deactivating', async () => {
    // Arrange
    mockedFetchMembers.mockResolvedValue({ members: [buildMember({ displayName: 'Ada Byron' })] });
    const user = userEvent.setup();
    renderWithProviders(<MembersPanel workspaceId={workspaceId} />);
    await screen.findByText('Ada Byron');

    // Act
    await user.click(screen.getByRole('button', { name: /^deactivate$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    // Assert
    expect(dialog).not.toBeInTheDocument();
    expect(mockedDeactivate).not.toHaveBeenCalled();
  });

  it('MembersPanel — Cancel invitation — cancels the pending invite by id', async () => {
    // Arrange — a pending-invitation row exposes Cancel invitation instead of Deactivate.
    const invitation = buildInvitation({ invitationId: '00000000-0000-0000-0000-0000000000fa' });
    mockedFetchMembers.mockResolvedValue({ members: [invitation] });
    mockedCancelInvitation.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<MembersPanel workspaceId={workspaceId} />);
    await screen.findByText('invitee@mws.ai');

    // Act
    await user.click(screen.getByRole('button', { name: /cancel invitation/i }));

    // Assert
    await waitFor(() =>
      expect(mockedCancelInvitation).toHaveBeenCalledWith(workspaceId, invitation.invitationId),
    );
  });

  it('MembersPanel — Deactivate — opens the dialog and deactivates', async () => {
    // Arrange
    mockedFetchMembers.mockResolvedValue({ members: [buildMember({ displayName: 'Ada Byron' })] });
    mockedDeactivate.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<MembersPanel workspaceId={workspaceId} />);
    await screen.findByText('Ada Byron');

    // Act
    await user.click(screen.getByRole('button', { name: /^deactivate$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Deactivate Ada Byron' }));

    // Assert
    await waitFor(() => expect(mockedDeactivate).toHaveBeenCalledTimes(1));
    expect(dialog).not.toBeInTheDocument();
  });
});
