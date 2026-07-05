// Tests for the Relationships card (S4/S5) + the Link-a-record / Copy modals it opens. The API
// boundary is mocked; renderWithProviders hosts the queries. Covers: loading→list with a resolved far
// name, the empty state, remove, opening the Link modal and adding a link, and opening the Copy modal —
// each meaningful rendered state under jest-axe.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { RecordId, WorkspaceId } from '@shared/types';

import { renderWithProviders, buildMe, buildMembership, buildTypedLink } from '@/test-utils';

import * as api from './api';
import { RelationshipsCard } from './RelationshipsCard';

expect.extend(toHaveNoViolations);
jest.mock('./api');

const mockedApi = api as jest.Mocked<typeof api>;
const RECORD = 'AIS-00000001' as RecordId;
const WS = 'ws-1' as WorkspaceId;

function renderCard() {
  return renderWithProviders(<RelationshipsCard recordId={RECORD} workspaceId={WS} />, {
    seedMe: buildMe({ memberships: [buildMembership({ workspaceId: WS, level: 'Member' })] }),
  });
}

describe('RelationshipsCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('RelationshipsCard — lists a link with its resolved far name', async () => {
    // Arrange
    mockedApi.fetchRecordLinks.mockResolvedValue([buildTypedLink()]);

    // Act
    const { container } = renderCard();

    // Assert
    expect(await screen.findByText('Summariser')).toBeInTheDocument();
    expect(screen.getByText('Related')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RelationshipsCard — shows the empty state when there are no links', async () => {
    // Arrange
    mockedApi.fetchRecordLinks.mockResolvedValue([]);

    // Act
    renderCard();

    // Assert
    expect(await screen.findByText('No linked records yet.')).toBeInTheDocument();
  });

  it('RelationshipsCard — removing a link calls the delete API', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.fetchRecordLinks.mockResolvedValue([buildTypedLink()]);
    mockedApi.deleteRecordLink.mockResolvedValue(undefined);
    renderCard();
    await screen.findByText('Summariser');

    // Act
    await user.click(screen.getByRole('button', { name: 'Remove link to AIS-00000002' }));

    // Assert — the delete fires, and the invalidation-driven refetch settles before teardown.
    await waitFor(() => expect(mockedApi.deleteRecordLink).toHaveBeenCalledWith(buildTypedLink().id));
    await waitFor(() => expect(mockedApi.fetchRecordLinks).toHaveBeenCalledTimes(2));
  });

  it('RelationshipsCard — Link a record opens the modal and adds a link', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.fetchRecordLinks.mockResolvedValue([]);
    mockedApi.addRecordLink.mockResolvedValue(buildTypedLink());
    renderCard();
    await screen.findByText('No linked records yet.');

    // Act — open the modal, enter a target, submit.
    await user.click(screen.getByRole('button', { name: 'Link a record' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(screen.getByRole('textbox', { name: 'Record ID' }), 'AIS-00000009');
    await user.click(screen.getByRole('button', { name: 'Add link' }));

    // Assert
    expect(mockedApi.addRecordLink).toHaveBeenCalledWith(RECORD, {
      toRecordId: 'AIS-00000009',
      kind: 'related',
    });
    expect(await axe(dialog)).toHaveNoViolations();
    // Let the success-driven close settle so nothing is pending at teardown.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('RelationshipsCard — Copy record opens the Copy modal with a workspace target', async () => {
    // Arrange — scope queries to this render's container so any leaked nodes from earlier tests
    // in the suite can't make the card's "Copy record" button ambiguous.
    const user = userEvent.setup();
    mockedApi.fetchRecordLinks.mockResolvedValue([]);
    const { container } = renderCard();
    const card = within(container);
    await card.findByText('No linked records yet.');

    // Act
    await user.click(card.getByRole('button', { name: 'Copy record' }));

    // Assert — the Copy dialog offers the caller's Member workspace as a target.
    expect(await card.findByRole('combobox', { name: 'Copy into' })).toBeInTheDocument();
    expect(card.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });
});
