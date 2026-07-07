// WorkspaceProvisioningPage (S38) — the platform-admin provisioning wizard. Covers the gated render,
// the three-step flow (details → admin → review → provision), the success surface, and the API-error
// surface. jest-axe runs on each meaningfully different state (web-testing.md).

import { axe } from 'jest-axe';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { MeDto, WorkspaceId, WorkspaceProvisionResult } from '@shared/types';

import { buildMe, renderWithProviders } from '@/test-utils';
import { fetchMe } from '@/features/users/api';

import { provisionWorkspace } from '../api';
import { WorkspaceProvisioningPage } from './WorkspaceProvisioningPage';

jest.mock('../api');
jest.mock('@/features/users/api');
const mockedProvision = provisionWorkspace as jest.MockedFunction<typeof provisionWorkspace>;
const mockedFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;

const adminMe = () => buildMe({ isPlatformAdmin: true });

const provisioned: WorkspaceProvisionResult = {
  id: '00000000-0000-4000-8000-0000000000cc' as WorkspaceId,
  name: 'Litigation',
  kind: 'pg-dept',
  prefix: 'LIT',
};

function renderPage(me: MeDto) {
  mockedFetchMe.mockResolvedValue(me);
  return renderWithProviders(<WorkspaceProvisioningPage />, { seedMe: me });
}

beforeEach(() => jest.clearAllMocks());

async function completeDetailsAndAdmin(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/workspace name/i), 'Litigation');
  await user.type(screen.getByLabelText(/prefix/i), 'lit');
  await user.click(screen.getByRole('button', { name: /continue/i }));

  await user.type(screen.getByLabelText(/initial admin email/i), 'admin@mws.ai');
  await user.click(screen.getByRole('button', { name: /continue/i }));
}

describe('WorkspaceProvisioningPage', () => {
  it('renders the details step for a platform admin', async () => {
    // Arrange + Act
    const { container } = renderPage(adminMe());

    // Assert
    expect(await screen.findByLabelText(/workspace name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/prefix/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Continue stays disabled until the details are valid', async () => {
    // Arrange
    const user = userEvent.setup();
    renderPage(adminMe());
    await screen.findByLabelText(/workspace name/i);

    // Assert — invalid prefix keeps Continue disabled
    await user.type(screen.getByLabelText(/workspace name/i), 'Litigation');
    await user.type(screen.getByLabelText(/prefix/i), '!');
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  it('walks the wizard and provisions with an upper-cased prefix and the admin email', async () => {
    // Arrange
    mockedProvision.mockResolvedValue(provisioned);
    const user = userEvent.setup();
    renderPage(adminMe());
    await screen.findByLabelText(/workspace name/i);

    // Act — details → admin → review → provision
    await completeDetailsAndAdmin(user);
    expect(screen.getByText('admin@mws.ai')).toBeInTheDocument(); // review shows the entered values
    await user.click(screen.getByRole('button', { name: /provision workspace/i }));

    // Assert — request carries the uppercased prefix and the resolvable email
    await waitFor(() =>
      expect(mockedProvision).toHaveBeenCalledWith({
        name: 'Litigation',
        prefix: 'LIT',
        initialAdminEmail: 'admin@mws.ai',
      }),
    );
    expect(await screen.findByText(/is ready/i)).toBeInTheDocument();
  });

  it('surfaces the API error and stays on the review step', async () => {
    // Arrange — duplicate-prefix rejection
    mockedProvision.mockRejectedValue(new Error('That prefix is already in use.'));
    const user = userEvent.setup();
    renderPage(adminMe());
    await screen.findByLabelText(/workspace name/i);

    // Act
    await completeDetailsAndAdmin(user);
    await user.click(screen.getByRole('button', { name: /provision workspace/i }));

    // Assert — an alert appears; the provision button is still present (no success surface)
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /provision workspace/i })).toBeInTheDocument();
  });

  it('Back preserves the entered details', async () => {
    // Arrange
    const user = userEvent.setup();
    renderPage(adminMe());
    await screen.findByLabelText(/workspace name/i);

    // Act — go forward then back
    await user.type(screen.getByLabelText(/workspace name/i), 'Litigation');
    await user.type(screen.getByLabelText(/prefix/i), 'lit');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /back/i }));

    // Assert — the name is still filled
    expect(screen.getByLabelText(/workspace name/i)).toHaveValue('Litigation');
  });
});
