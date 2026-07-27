// Behaviour + a11y tests for the confirm-as-duplicate modal. Covers the naming/consequence copy, a successful
// confirm, the error state, and cancel. The HTTP boundary is mocked; axe runs on the default and error states.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { RecordId, WorkspaceId } from '@shared/types';

import { buildMe, renderWithProviders } from '@/test-utils';
import { apiFetch } from '@/shared/http/apiClient';

import { ConfirmDuplicateModal } from './ConfirmDuplicateModal';
import type { DuplicateCandidate } from '../types';

jest.mock('@/shared/http/apiClient');

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const CANDIDATE: DuplicateCandidate = {
  recordId: 'LIT-9010',
  title: 'Acme onboarding',
  score: 0.9,
  rationale: 'Both describe the same Acme onboarding request.',
};

function renderModal(overrides: { onClose?: jest.Mock; onConfirmed?: jest.Mock } = {}) {
  const onClose = overrides.onClose ?? jest.fn();
  const onConfirmed = overrides.onConfirmed ?? jest.fn();
  const view = renderWithProviders(
    <ConfirmDuplicateModal
      workspaceId={'ws-1' as WorkspaceId}
      recordId={'LIT-9004' as RecordId}
      recordName="Onboard Acme"
      candidate={CANDIDATE}
      onClose={onClose}
      onConfirmed={onConfirmed}
    />,
    // Seed me so the ActiveWorkspaceProvider's useMe() is a cache hit and does not consume a queued
    // apiFetch mock response (this suite stubs apiFetch with ...ValueOnce).
    { seedMe: buildMe() },
  );
  return { onClose, onConfirmed, ...view };
}

describe('ConfirmDuplicateModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ConfirmDuplicateModal — names the record + surviving match and its consequence; no violations', async () => {
    // Act
    const { container } = renderModal();

    // Assert
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/onboard acme/i);
    expect(dialog).toHaveTextContent(/acme onboarding/i);
    expect(dialog).toHaveTextContent(/can’t be undone/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ConfirmDuplicateModal — confirm posts and calls onConfirmed', async () => {
    // Arrange
    mockedFetch.mockResolvedValue(undefined as never);
    const user = userEvent.setup();
    const { onConfirmed } = renderModal();

    // Act
    await user.click(screen.getByRole('button', { name: /^mark as duplicate$/i }));

    // Assert
    await waitFor(() =>
      expect(mockedFetch).toHaveBeenCalledWith(
        '/v1/workspaces/ws-1/ai/duplicate-check/LIT-9004/confirm',
        {
          method: 'POST',
          body: { duplicateOfRecordId: 'LIT-9010', rationale: CANDIDATE.rationale },
        },
      ),
    );
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
  });

  it('ConfirmDuplicateModal — confirm fails — shows an error and no violations', async () => {
    // Arrange
    mockedFetch.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    const { onConfirmed, container } = renderModal();

    // Act
    await user.click(screen.getByRole('button', { name: /^mark as duplicate$/i }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not be marked as a duplicate/i,
    );
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ConfirmDuplicateModal — while confirming — shows a pending label', async () => {
    // Arrange - a request that never resolves holds the pending state.
    mockedFetch.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderModal();

    // Act
    await user.click(screen.getByRole('button', { name: /^mark as duplicate$/i }));

    // Assert
    expect(await screen.findByRole('button', { name: /marking…/i })).toBeInTheDocument();
  });

  it('ConfirmDuplicateModal — cancel dismisses without posting', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onClose } = renderModal();

    // Act
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    // Assert
    expect(onClose).toHaveBeenCalled();
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
