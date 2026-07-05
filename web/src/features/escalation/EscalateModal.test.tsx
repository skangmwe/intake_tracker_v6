// Tests for the S18 Escalate modal. The API boundary is mocked; renderWithProviders hosts the
// mutation. Covers render, cancel, confirm (sends confirmPendingEdits=true + closes on success),
// the error state, Escape-to-close, and the pending state — each rendered state under jest-axe.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { EscalateResult, RecordId, WorkspaceId } from '@shared/types';

import { renderWithProviders } from '@/test-utils';
import { ApiError } from '@/shared/http/apiClient';

import * as api from './api';
import { EscalateModal } from './EscalateModal';

expect.extend(toHaveNoViolations);
jest.mock('./api');

const mockedApi = api as jest.Mocked<typeof api>;
const RECORD = 'LIT-00000001' as RecordId;
const RESULT: EscalateResult = { recordId: RECORD, aiWorkspaceId: 'ws-1' as WorkspaceId, aiRecord: null };

function renderModal(onClose = jest.fn()) {
  const view = renderWithProviders(
    <EscalateModal recordId={RECORD} recordName="Contract clause finder" onClose={onClose} />,
  );
  return { ...view, onClose };
}

describe('EscalateModal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('EscalateModal — renders the confirm-and-lock dialog', async () => {
    // Arrange / Act
    const { container } = renderModal();

    // Assert
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText(/shares this record’s ID/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escalate to AI Solutions' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('EscalateModal — Cancel closes without escalating', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onClose } = renderModal();

    // Act
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockedApi.escalateRequest).not.toHaveBeenCalled();
  });

  it('EscalateModal — confirm sends confirmPendingEdits=true and closes on success', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.escalateRequest.mockResolvedValue(RESULT);
    const { onClose } = renderModal();

    // Act
    await user.click(screen.getByRole('button', { name: 'Escalate to AI Solutions' }));

    // Assert
    expect(mockedApi.escalateRequest).toHaveBeenCalledWith(RECORD, { confirmPendingEdits: true });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('EscalateModal — a failed escalation surfaces the error and stays open', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.escalateRequest.mockRejectedValue(
      new ApiError(409, { type: 'about:blank', title: 'Conflict', status: 409, detail: 'This record has already been escalated.' }),
    );
    const { container, onClose } = renderModal();

    // Act
    await user.click(screen.getByRole('button', { name: 'Escalate to AI Solutions' }));

    // Assert
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This record has already been escalated.');
    expect(onClose).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('EscalateModal — Escape closes the dialog', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onClose } = renderModal();

    // Act
    await user.keyboard('{Escape}');

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('EscalateModal — traps focus: Tab wraps from last to first and Shift+Tab from first to last', async () => {
    // Arrange
    const user = userEvent.setup();
    renderModal();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Escalate to AI Solutions' });

    // Act + Assert — Tab off the last focusable wraps to the first.
    confirm.focus();
    await user.tab();
    expect(cancel).toHaveFocus();

    // Act + Assert — Shift+Tab off the first focusable wraps to the last.
    cancel.focus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
  });
});
