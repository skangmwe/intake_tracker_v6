// Tests for RelationshipsSidePanel (Slice 25) — the S4/S5 record-detail side panel that
// lists relationships defined for the record's FromObjectType with a per-row link count.
// The api boundary is mocked; each meaningfully different rendered state is checked with
// jest-axe. Covers: loading, empty (no relationships configured), sections rendered with
// per-relationship counts, and the row-level fetch-links error.

import { screen, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { RecordId, WorkspaceId } from '@shared/types';

import { buildRelationship, buildRelationshipLink, renderWithProviders } from '@/test-utils';

import * as api from './api';
import { RelationshipsSidePanel } from './RelationshipsSidePanel';

expect.extend(toHaveNoViolations);
jest.mock('./api');

const mockedApi = api as jest.Mocked<typeof api>;
const WS = 'ws-1' as WorkspaceId;
const RECORD = 'AIS-00000001' as RecordId;

function renderPanel() {
  return renderWithProviders(
    <RelationshipsSidePanel workspaceId={WS} recordId={RECORD} fromObjectType="Request" />,
  );
}

describe('RelationshipsSidePanel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('RelationshipsSidePanel — loading — shows the loading message', () => {
    // Arrange — pending relationships fetch keeps the panel in the loading branch.
    mockedApi.fetchRelationships.mockImplementation(
      () => new Promise(() => {
        /* never resolves */
      }),
    );

    // Act
    renderPanel();

    // Assert
    expect(screen.getByText('Loading relationships…')).toBeInTheDocument();
  });

  it('RelationshipsSidePanel — no relationships configured — shows the empty state', async () => {
    // Arrange
    mockedApi.fetchRelationships.mockResolvedValue([]);

    // Act
    const { container } = renderPanel();

    // Assert
    expect(
      await screen.findByText('No relationships configured for this object.'),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RelationshipsSidePanel — lists a section with the link count', async () => {
    // Arrange
    mockedApi.fetchRelationships.mockResolvedValue([buildRelationship()]);
    mockedApi.fetchRelationshipLinks.mockResolvedValue([buildRelationshipLink(), buildRelationshipLink({ id: 'l2' })]);

    // Act
    const { container } = renderPanel();

    // Assert — the section renders with the from-side label and its count badge; jest-axe passes.
    expect(await screen.findByText('Tasks')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
    expect(screen.getByText('2 linked records.')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RelationshipsSidePanel — one linked record — renders singular copy', async () => {
    // Arrange
    mockedApi.fetchRelationships.mockResolvedValue([buildRelationship()]);
    mockedApi.fetchRelationshipLinks.mockResolvedValue([buildRelationshipLink()]);

    // Act
    renderPanel();

    // Assert
    await screen.findByText('Tasks');
    await waitFor(() => expect(screen.getByText('1 linked record.')).toBeInTheDocument());
  });

  it('RelationshipsSidePanel — row-level fetch failure surfaces an inline alert', async () => {
    // Arrange
    mockedApi.fetchRelationships.mockResolvedValue([buildRelationship()]);
    mockedApi.fetchRelationshipLinks.mockRejectedValue(new Error('link fetch failed'));

    // Act
    renderPanel();

    // Assert — the section header still renders; only the count row swaps for an alert.
    await screen.findByText('Tasks');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/couldn.t load tasks/i);
  });

  it('RelationshipsSidePanel — fetchRelationships failure — surfaces the warning alert', async () => {
    // Arrange
    mockedApi.fetchRelationships.mockRejectedValue(new Error('nope'));

    // Act
    renderPanel();

    // Assert
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/couldn.t load relationships/i);
  });
});
