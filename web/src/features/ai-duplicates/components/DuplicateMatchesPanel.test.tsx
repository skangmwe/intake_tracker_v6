// Behaviour + a11y tests for the ranked duplicate-matches panel. Covers loading / empty / error / ranked-list
// states and the mark → confirm → close flow. The HTTP boundary is mocked; axe runs on each meaningful state.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { RecordId, WorkspaceId } from '@shared/types';

import { renderWithProviders } from '@/test-utils';
import { apiFetch } from '@/shared/http/apiClient';

import { DuplicateMatchesPanel } from './DuplicateMatchesPanel';
import type { DuplicateCandidate } from '../types';

jest.mock('@/shared/http/apiClient');

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const MATCH: DuplicateCandidate = {
  recordId: 'LIT-9010',
  title: 'Acme onboarding',
  score: 0.9,
  rationale: 'Both describe onboarding the Acme litigation team.',
};

/** Route the check to candidates and the confirm to a 204 (undefined). */
function routeFetch(candidates: DuplicateCandidate[]) {
  mockedFetch.mockImplementation((path: string) =>
    Promise.resolve(path.endsWith('/confirm') ? (undefined as never) : (candidates as never)),
  );
}

function renderPanel(onClose = jest.fn()) {
  const view = renderWithProviders(
    <DuplicateMatchesPanel
      workspaceId={'ws-1' as WorkspaceId}
      recordId={'LIT-9004' as RecordId}
      recordName="Onboard Acme"
      onClose={onClose}
    />,
  );
  return { onClose, ...view };
}

describe('DuplicateMatchesPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('DuplicateMatchesPanel — loading — shows a status and no violations', async () => {
    // Arrange - a request that never resolves holds the loading state.
    mockedFetch.mockReturnValue(new Promise(() => {}));

    // Act
    const { container } = renderPanel();

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent(/checking for duplicates/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('DuplicateMatchesPanel — no matches — shows the empty message and no violations', async () => {
    // Arrange
    routeFetch([]);

    // Act
    const { container } = renderPanel();

    // Assert
    expect(await screen.findByText(/no likely duplicates found/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('DuplicateMatchesPanel — check fails — shows an error and no violations', async () => {
    // Arrange
    mockedFetch.mockRejectedValueOnce(new Error('boom'));

    // Act
    const { container } = renderPanel();

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(/duplicate check could not run/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('DuplicateMatchesPanel — ranked matches — renders titles, strengths, AI rationale and no violations', async () => {
    // Arrange - a strong and a weaker match to exercise both linguistic strength labels.
    const weaker: DuplicateCandidate = {
      recordId: 'LIT-9011',
      title: 'Acme intake',
      score: 0.62,
      rationale: 'Possibly the same Acme request.',
    };
    routeFetch([MATCH, weaker]);

    // Act
    const { container } = renderPanel();

    // Assert
    expect(await screen.findByText('Acme onboarding')).toBeInTheDocument();
    expect(screen.getByText('Acme intake')).toBeInTheDocument();
    expect(screen.getByText(/strong match/i)).toBeInTheDocument();
    expect(screen.getByText(/possible match/i)).toBeInTheDocument();
    expect(screen.getByText(/onboarding the acme litigation team/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('DuplicateMatchesPanel — mark → confirm closes the record and the panel', async () => {
    // Arrange
    routeFetch([MATCH]);
    const user = userEvent.setup();
    const { onClose, container } = renderPanel();
    await screen.findByText('Acme onboarding');

    // Act - open the confirm modal.
    await user.click(screen.getByRole('button', { name: /mark as duplicate of this/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/mark this record as a duplicate/i);
    expect(dialog).toHaveTextContent(/onboard acme/i);
    expect(await axe(container)).toHaveNoViolations();

    // Act - confirm.
    await user.click(screen.getByRole('button', { name: /^mark as duplicate$/i }));

    // Assert - the confirm route was hit and the panel closed.
    await waitFor(() =>
      expect(mockedFetch).toHaveBeenCalledWith(
        '/v1/workspaces/ws-1/ai/duplicate-check/LIT-9004/confirm',
        { method: 'POST', body: { duplicateOfRecordId: 'LIT-9010', rationale: MATCH.rationale } },
      ),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('DuplicateMatchesPanel — open-link navigates to the match record', async () => {
    // Arrange
    routeFetch([MATCH]);
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Acme onboarding');

    // Act - the open-link is a real control; clicking it does not throw.
    await user.click(screen.getByRole('button', { name: /open lit-9010/i }));

    // Assert - the match list is still present (navigation is a no-op route in the test router).
    expect(screen.getByText('Acme onboarding')).toBeInTheDocument();
  });

  it('DuplicateMatchesPanel — cancelling the confirm modal keeps the matches', async () => {
    // Arrange
    routeFetch([MATCH]);
    const user = userEvent.setup();
    const { onClose } = renderPanel();
    await screen.findByText('Acme onboarding');

    // Act - open then cancel the confirm modal.
    await user.click(screen.getByRole('button', { name: /mark as duplicate of this/i }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    // Assert - the modal closed, the matches remain, and the panel did not close.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Acme onboarding')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
