// Behaviour + a11y tests for the AI settings admin gating page. Covers the no-access and admin states,
// and the multi-workspace picker. The ai-config api is mocked; `me` is seeded. axe runs on both states.

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { WorkspaceId } from '@shared/types';

import { buildMe, buildMembership, renderWithProviders } from '@/test-utils';

import * as api from '../api';
import { AiSettingsPage } from './AiSettingsPage';

jest.mock('../api');

const mockedApi = api as jest.Mocked<typeof api>;

describe('AiSettingsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.fetchAiConfig.mockResolvedValue({ enabled: false, contentFieldAllowlist: ['Name'] });
  });

  it('AiSettingsPage — not a workspace admin — shows a no-access message, no violations', async () => {
    // Arrange / Act
    const { container } = renderWithProviders(<AiSettingsPage />, {
      seedMe: buildMe({ memberships: [buildMembership({ level: 'Member' })] }),
    });

    // Assert
    expect(await screen.findByText(/need to be a workspace admin to manage ai settings/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('AiSettingsPage — single admin workspace — renders the panel without a picker, no violations', async () => {
    // Arrange / Act
    const { container } = renderWithProviders(<AiSettingsPage />, {
      seedMe: buildMe({ memberships: [buildMembership({ level: 'WorkspaceAdmin' })] }),
    });

    // Assert
    expect(await screen.findByRole('checkbox', { name: /enable ai assist/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /workspace/i })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('AiSettingsPage — multiple admin workspaces — shows the workspace picker', async () => {
    // Arrange
    const me = buildMe({
      memberships: [
        buildMembership({ level: 'WorkspaceAdmin', workspaceName: 'AI Solutions' }),
        buildMembership({
          level: 'WorkspaceAdmin',
          workspaceId: 'ws-2' as WorkspaceId,
          workspaceName: 'Litigation',
        }),
      ],
    });

    // Act
    renderWithProviders(<AiSettingsPage />, { seedMe: me });
    await screen.findByRole('checkbox', { name: /enable ai assist/i });
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: /workspace/i }), 'ws-2');

    // Assert - switching the workspace loads that workspace's config.
    expect(screen.getByRole('combobox', { name: /workspace/i })).toHaveValue('ws-2');
    expect(mockedApi.fetchAiConfig).toHaveBeenCalledWith('ws-2', expect.anything());
  });
});
