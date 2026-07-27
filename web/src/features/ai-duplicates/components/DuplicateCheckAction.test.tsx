// Behaviour + a11y tests for the "Check for duplicates" action. Covers the off-switch gate (hidden), the idle
// action, and opening the matches panel on demand. The config hook and the HTTP boundary are mocked; axe runs on
// each meaningfully different rendered state.

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { RecordId, WorkspaceId } from '@shared/types';

import { buildMe, renderWithProviders } from '@/test-utils';
import { apiFetch } from '@/shared/http/apiClient';
import { useAiConfig } from '@/features/ai-config';

import { DuplicateCheckAction } from './DuplicateCheckAction';

jest.mock('@/shared/http/apiClient');
jest.mock('@/features/ai-config');

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockedUseAiConfig = useAiConfig as jest.MockedFunction<typeof useAiConfig>;

function configEnabled(enabled: boolean) {
  mockedUseAiConfig.mockReturnValue({
    data: enabled
      ? { enabled: true, contentFieldAllowlist: ['Name', 'Description', 'WorkflowDetails'] }
      : undefined,
  } as ReturnType<typeof useAiConfig>);
}

function renderAction() {
  return renderWithProviders(
    <DuplicateCheckAction
      workspaceId={'ws-1' as WorkspaceId}
      recordId={'LIT-9004' as RecordId}
      recordName="Onboard Acme"
    />,
    // Seed me so the ActiveWorkspaceProvider's useMe() is a cache hit and does not consume a queued
    // apiFetch mock response (this suite stubs apiFetch with ...ValueOnce).
    { seedMe: buildMe() },
  );
}

describe('DuplicateCheckAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('DuplicateCheckAction — AI assist off — renders nothing and no violations', async () => {
    // Arrange
    configEnabled(false);

    // Act
    const { container } = renderAction();

    // Assert
    expect(screen.queryByRole('button', { name: /check for duplicates/i })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('DuplicateCheckAction — enabled idle — shows the action and no violations', async () => {
    // Arrange
    configEnabled(true);

    // Act
    const { container } = renderAction();

    // Assert
    expect(screen.getByRole('button', { name: /check for duplicates/i })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('DuplicateCheckAction — opening the panel runs the check on demand', async () => {
    // Arrange - nothing runs until the user opens the panel.
    configEnabled(true);
    mockedFetch.mockResolvedValue([]);
    const user = userEvent.setup();
    const { container } = renderAction();
    expect(mockedFetch).not.toHaveBeenCalled();

    // Act
    await user.click(screen.getByRole('button', { name: /check for duplicates/i }));

    // Assert - the panel opened and hit the duplicate-check route once.
    expect(await screen.findByText(/no likely duplicates found/i)).toBeInTheDocument();
    expect(mockedFetch).toHaveBeenCalledWith(
      '/v1/workspaces/ws-1/ai/duplicate-check/LIT-9004',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('DuplicateCheckAction — closing the panel returns to the idle action', async () => {
    // Arrange
    configEnabled(true);
    mockedFetch.mockResolvedValue([]);
    const user = userEvent.setup();
    renderAction();

    // Act - open then close the panel.
    await user.click(screen.getByRole('button', { name: /check for duplicates/i }));
    await screen.findByText(/no likely duplicates found/i);
    await user.click(screen.getByRole('button', { name: /^close$/i }));

    // Assert - back to the idle action.
    expect(screen.getByRole('button', { name: /check for duplicates/i })).toBeInTheDocument();
  });
});
