// Behaviour + a11y tests for the AI settings admin gating page. Covers the not-admin and admin
// states, both scoped to the active workspace (from ActiveWorkspaceContext) rather than a per-page
// workspace picker. The ai-config api is mocked; `me` is seeded. axe runs on both states.

import { screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { buildMe, buildMembership, renderWithProviders } from '@/test-utils';

import * as api from '../api';
import { AiSettingsPage } from './AiSettingsPage';

jest.mock('../api');

const mockedApi = api as jest.Mocked<typeof api>;

describe('AiSettingsPage', () => {
  beforeEach(() => localStorage.clear());

  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.fetchAiConfig.mockResolvedValue({ enabled: false, contentFieldAllowlist: ['Name'] });
  });

  it('AiSettingsPage — active workspace is member-only — shows the admin-required state', async () => {
    // Arrange
    const seedMe = buildMe({
      memberships: [buildMembership({ level: 'Member' })],
    });

    // Act
    const { container } = renderWithProviders(<AiSettingsPage />, { seedMe });

    // Assert
    expect(await screen.findByText(/need to be a workspace admin to manage ai settings/i)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /enable ai assist/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('AiSettingsPage — active workspace is admin — renders the panel with no workspace picker', async () => {
    // Arrange
    const seedMe = buildMe({ memberships: [buildMembership({ level: 'WorkspaceAdmin' })] });

    // Act
    const { container } = renderWithProviders(<AiSettingsPage />, { seedMe });

    // Assert
    expect(await screen.findByRole('checkbox', { name: /enable ai assist/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
