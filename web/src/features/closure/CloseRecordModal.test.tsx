// Tests for the Close-with-Outcome modal (S4/S5). The API boundary is mocked; renderWithProviders
// hosts the mutation. Covers: render, Cancel, the Duplicate-requires-target branch, a successful close
// (sends the outcome + closes), the error state, and Escape — each rendered state under jest-axe.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { RecordId } from '@shared/types';

import { renderWithProviders, buildRequestDto } from '@/test-utils';
import { ApiError } from '@/shared/http/apiClient';

import * as api from './api';
import { CloseRecordModal } from './CloseRecordModal';

expect.extend(toHaveNoViolations);
jest.mock('./api');

const mockedApi = api as jest.Mocked<typeof api>;
const RECORD = 'AIS-00000001' as RecordId;

function renderModal(onClose = jest.fn()) {
  const view = renderWithProviders(
    <CloseRecordModal recordId={RECORD} recordName="Meeting-notes extractor" onClose={onClose} />,
  );
  return { ...view, onClose };
}

describe('CloseRecordModal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('CloseRecordModal — renders the outcome dialog', async () => {
    // Arrange / Act
    const { container } = renderModal();

    // Assert
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('combobox', { name: 'Outcome' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close record' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('CloseRecordModal — Cancel closes without closing the record', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onClose } = renderModal();

    // Act
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockedApi.closeRecord).not.toHaveBeenCalled();
  });

  it('CloseRecordModal — Duplicate reveals a target field and blocks submit until it is filled', async () => {
    // Arrange
    const user = userEvent.setup();
    renderModal();

    // Act — choose Duplicate, then try to submit with no target.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Outcome' }), 'Duplicate');
    await user.click(screen.getByRole('button', { name: 'Close record' }));

    // Assert — a validation error shows and no API call was made.
    expect(await screen.findByText('Name the record this duplicates.')).toBeInTheDocument();
    expect(mockedApi.closeRecord).not.toHaveBeenCalled();
  });

  it('CloseRecordModal — a Live close sends the delivery outcome and closes on success', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.closeRecord.mockResolvedValue(buildRequestDto());
    const { onClose } = renderModal();

    // Act
    await user.click(screen.getByRole('button', { name: 'Close record' }));

    // Assert
    expect(mockedApi.closeRecord).toHaveBeenCalledWith(RECORD, {
      outcome: { kind: 'delivery', value: 'Live', notes: '' },
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('CloseRecordModal — a failed close surfaces the error and stays open', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.closeRecord.mockRejectedValue(
      new ApiError(403, { type: 'about:blank', title: 'Forbidden', status: 403, detail: 'You do not have access to this request.' }),
    );
    const { container, onClose } = renderModal();

    // Act
    await user.click(screen.getByRole('button', { name: 'Close record' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have access to this request.');
    expect(onClose).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('CloseRecordModal — Escape closes the dialog', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onClose } = renderModal();

    // Act
    await user.keyboard('{Escape}');

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
