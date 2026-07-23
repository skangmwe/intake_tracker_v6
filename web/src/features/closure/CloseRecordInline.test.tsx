// Tests for the Close-with-Outcome inline panel (S4/S5). The API boundary is mocked; renderWithProviders
// hosts the mutation. The outcome comes from a prop (the Status picker chose it), so these cover: render,
// Cancel, the notes-required-unless-Live rule (non-Live blocks until a note is entered), a successful
// close (sends the outcome + calls onClosed), and the error state — each rendered state under jest-axe.

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

  it('CloseRecordInline — there is no Duplicate-of field (the link lives as a linked record)', () => {
    // Arrange / Act — even for the Duplicate outcome, no target field is collected here.
    renderPanel('Duplicate');

    // Assert
    expect(screen.queryByRole('textbox', { name: 'Duplicate of' })).not.toBeInTheDocument();
  });

  it('CloseRecordInline — a non-Live outcome requires a note before it can close', async () => {
    // Arrange
    const user = userEvent.setup();
    const { container, onClosed } = renderPanel('Withdrawn');

    // Act / Assert — with no note, Close is blocked and the required-note error shows.
    const closeButton = screen.getByRole('button', { name: 'Close record' });
    expect(closeButton).toBeDisabled();
    expect(screen.getByText('Add a note explaining this outcome.')).toBeInTheDocument();
    await user.click(closeButton);
    expect(mockedApi.closeRecord).not.toHaveBeenCalled();
    expect(onClosed).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('CloseRecordInline — a non-Live outcome sends the note once entered', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.closeRecord.mockResolvedValue(buildRequestDto());
    const { onClosed } = renderPanel('Withdrawn');

    // Act — entering a note unblocks the close.
    await user.type(screen.getByRole('textbox', { name: 'Notes' }), 'Requester withdrew the ask.');
    await user.click(screen.getByRole('button', { name: 'Close record' }));

    // Assert
    expect(mockedApi.closeRecord).toHaveBeenCalledWith(RECORD, {
      outcome: { kind: 'local', value: 'Withdrawn', notes: 'Requester withdrew the ask.' },
    });
    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
  });

  it('CloseRecordInline — a Live close sends the delivery outcome with no note required', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.closeRecord.mockResolvedValue(buildRequestDto());
    const { onClosed } = renderPanel('Live');

    // Act — Live is the one outcome whose notes stay optional.
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
      new ApiError(403, {
        type: 'about:blank',
        title: 'Forbidden',
        status: 403,
        detail: 'You do not have access to this request.',
      }),
    );
    const { container, onClosed } = renderPanel('Live');

    // Act
    await user.click(screen.getByRole('button', { name: 'Close record' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have access to this request.',
    );
    expect(onClosed).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });
});
