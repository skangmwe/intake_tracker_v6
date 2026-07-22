// Tests for the Close-with-Outcome inline panel (S4/S5). The API boundary is mocked; renderWithProviders
// hosts the mutation. The outcome comes from a prop (the Status picker chose it), so these cover: render,
// Cancel, the Duplicate-requires-target branch, a successful close (sends the outcome + calls onClosed),
// and the error state — each rendered state under jest-axe.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { RecordId } from '@shared/types';

import { renderWithProviders, buildRequestDto } from '@/test-utils';
import { ApiError } from '@/shared/http/apiClient';

import * as api from './api';
import { CloseRecordInline, type CloseOutcomeValue } from './CloseRecordInline';

expect.extend(toHaveNoViolations);
jest.mock('./api');

const mockedApi = api as jest.Mocked<typeof api>;
const RECORD = 'AIS-00000001' as RecordId;

function renderPanel(outcome: CloseOutcomeValue = 'Live') {
  const onCancel = jest.fn();
  const onClosed = jest.fn();
  const view = renderWithProviders(
    <CloseRecordInline
      recordId={RECORD}
      recordName="Meeting-notes extractor"
      outcome={outcome}
      onCancel={onCancel}
      onClosed={onClosed}
    />,
  );
  return { ...view, onCancel, onClosed };
}

describe('CloseRecordInline', () => {
  beforeEach(() => jest.clearAllMocks());

  it('CloseRecordInline — renders the inline outcome panel', async () => {
    // Arrange / Act
    const { container } = renderPanel();

    // Assert
    expect(screen.getByText(/Record an outcome for/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close record' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('CloseRecordInline — Cancel abandons the close without closing the record', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onCancel } = renderPanel();

    // Act
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // Assert
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(mockedApi.closeRecord).not.toHaveBeenCalled();
  });

  it('CloseRecordInline — Duplicate reveals a target field and blocks submit until it is filled', async () => {
    // Arrange
    const user = userEvent.setup();
    const { container, onClosed } = renderPanel('Duplicate');

    // Act — a Duplicate outcome shows the target field; submit with no target.
    expect(screen.getByRole('textbox', { name: 'Duplicate of' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close record' }));

    // Assert — a validation error shows and no API call was made.
    expect(await screen.findByText('Name the record this duplicates.')).toBeInTheDocument();
    expect(mockedApi.closeRecord).not.toHaveBeenCalled();
    expect(onClosed).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('CloseRecordInline — a Live close sends the delivery outcome and calls onClosed', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.closeRecord.mockResolvedValue(buildRequestDto());
    const { onClosed } = renderPanel('Live');

    // Act
    await user.click(screen.getByRole('button', { name: 'Close record' }));

    // Assert
    expect(mockedApi.closeRecord).toHaveBeenCalledWith(RECORD, {
      outcome: { kind: 'delivery', value: 'Live', notes: '' },
    });
    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
  });

  it('CloseRecordInline — a failed close surfaces the error and stays open', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.closeRecord.mockRejectedValue(
      new ApiError(403, { type: 'about:blank', title: 'Forbidden', status: 403, detail: 'You do not have access to this request.' }),
    );
    const { container, onClosed } = renderPanel('Live');

    // Act
    await user.click(screen.getByRole('button', { name: 'Close record' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have access to this request.');
    expect(onClosed).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });
});
