// Behaviour + a11y tests for the AI-config panel. Covers loading, error, loaded (on/off), the save flow,
// and the empty-allowlist guard. The api is mocked; axe runs on each meaningfully different rendered state.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { WorkspaceId } from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import * as api from '../api';
import { AiConfigPanel } from './AiConfigPanel';

jest.mock('../api');

const mockedApi = api as jest.Mocked<typeof api>;
const WORKSPACE_ID = 'ws-1' as WorkspaceId;

const enabledConfig = { enabled: true, contentFieldAllowlist: ['Name', 'Description', 'WorkflowDetails'] };

describe('AiConfigPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('AiConfigPanel — while loading — shows a status and no violations', async () => {
    // Arrange - a fetch that never resolves keeps the loading state.
    mockedApi.fetchAiConfig.mockReturnValue(new Promise(() => {}));

    // Act
    const { container } = renderWithProviders(<AiConfigPanel workspaceId={WORKSPACE_ID} />);

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent(/loading ai settings/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('AiConfigPanel — load failure — shows an error with retry and no violations', async () => {
    // Arrange
    mockedApi.fetchAiConfig.mockRejectedValueOnce(new Error('boom'));

    // Act
    const { container } = renderWithProviders(<AiConfigPanel workspaceId={WORKSPACE_ID} />);

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t load the ai settings/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('AiConfigPanel — loaded enabled — renders the toggle checked and fields, no violations', async () => {
    // Arrange
    mockedApi.fetchAiConfig.mockResolvedValue(enabledConfig);

    // Act
    const { container } = renderWithProviders(<AiConfigPanel workspaceId={WORKSPACE_ID} />);

    // Assert
    expect(await screen.findByRole('checkbox', { name: /enable ai assist/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Name' })).toBeChecked();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('AiConfigPanel — save flow — persists the edited enabled + allowlist', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.fetchAiConfig.mockResolvedValue(enabledConfig);
    mockedApi.updateAiConfig.mockResolvedValue({ enabled: false, contentFieldAllowlist: ['Name', 'Description'] });
    renderWithProviders(<AiConfigPanel workspaceId={WORKSPACE_ID} />);

    // Act - turn AI off, drop Workflow details, save.
    await user.click(await screen.findByRole('checkbox', { name: /enable ai assist/i }));
    await user.click(screen.getByRole('checkbox', { name: 'Workflow details' }));
    await user.click(screen.getByRole('button', { name: /save settings/i }));

    // Assert
    await waitFor(() =>
      expect(mockedApi.updateAiConfig).toHaveBeenCalledWith(WORKSPACE_ID, {
        enabled: false,
        contentFieldAllowlist: ['Name', 'Description'],
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/saved/i);
  });

  it('AiConfigPanel — no fields selected — blocks save and warns, no violations', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.fetchAiConfig.mockResolvedValue(enabledConfig);
    const { container } = renderWithProviders(<AiConfigPanel workspaceId={WORKSPACE_ID} />);
    await screen.findByRole('checkbox', { name: /enable ai assist/i });

    // Act - uncheck every content field.
    await user.click(screen.getByRole('checkbox', { name: 'Name' }));
    await user.click(screen.getByRole('checkbox', { name: 'Description' }));
    await user.click(screen.getByRole('checkbox', { name: 'Workflow details' }));

    // Assert
    expect(screen.getByRole('button', { name: /save settings/i })).toBeDisabled();
    expect(screen.getByText(/choose at least one field/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
