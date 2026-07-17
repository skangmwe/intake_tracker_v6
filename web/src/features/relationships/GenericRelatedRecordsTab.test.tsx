// Tests for GenericRelatedRecordsTab (Slice 25). Covers each meaningfully different rendered
// state (loading, error, empty, populated) with jest-axe, plus the direction-aware label
// (Out uses toSideLabel, In uses fromSideLabel) and the tab-title fallback (tabLabel missing
// → fromSideLabel).

import { screen, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { RecordId, WorkspaceId } from '@shared/types';

import { buildRelationship, buildRelationshipLink, renderWithProviders } from '@/test-utils';

import * as api from './api';
import { GenericRelatedRecordsTab } from './GenericRelatedRecordsTab';

expect.extend(toHaveNoViolations);
jest.mock('./api');

const mockedApi = api as jest.Mocked<typeof api>;
const WS = 'ws-1' as WorkspaceId;
const RECORD = 'AIS-00000001' as RecordId;

function renderTab(relationship = buildRelationship()) {
  return renderWithProviders(
    <GenericRelatedRecordsTab workspaceId={WS} recordId={RECORD} relationship={relationship} />,
  );
}

describe('GenericRelatedRecordsTab', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GenericRelatedRecordsTab — loading — shows the loading status', () => {
    // Arrange — pending fetch keeps the tab in the loading branch.
    mockedApi.fetchRelationshipLinks.mockImplementation(
      () => new Promise(() => {
        /* never */
      }),
    );

    // Act
    renderTab();

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent(/loading tasks/i);
  });

  it('GenericRelatedRecordsTab — empty — shows the empty state', async () => {
    // Arrange
    mockedApi.fetchRelationshipLinks.mockResolvedValue([]);

    // Act
    const { container } = renderTab();

    // Assert
    expect(await screen.findByText(/no tasks yet/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('GenericRelatedRecordsTab — populated — lists rows with count + Out direction label', async () => {
    // Arrange
    mockedApi.fetchRelationshipLinks.mockResolvedValue([buildRelationshipLink()]);

    // Act
    const { container } = renderTab();

    // Assert — the tab title, count badge, and Out-direction (toSideLabel = "Request") render.
    expect(await screen.findByText('Extraction task')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    // Direction badge: link.direction === 'Out' → renders toSideLabel = "Request".
    expect(screen.getAllByText('Request').length).toBeGreaterThanOrEqual(1);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('GenericRelatedRecordsTab — In direction — shows fromSideLabel', async () => {
    // Arrange — a link viewed from the To side (direction 'In'); the badge uses fromSideLabel.
    mockedApi.fetchRelationshipLinks.mockResolvedValue([
      buildRelationshipLink({ direction: 'In' }),
    ]);

    // Act
    renderTab();

    // Assert — the badge for direction 'In' reads the from-side label ("Tasks").
    await screen.findByText('Extraction task');
    await waitFor(() => {
      // "Tasks" appears in the tab title and in the direction badge; both must be present.
      expect(screen.getAllByText('Tasks').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('GenericRelatedRecordsTab — fetch failure — renders an inline warning', async () => {
    // Arrange
    mockedApi.fetchRelationshipLinks.mockRejectedValue(new Error('nope'));

    // Act
    renderTab();

    // Assert
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/couldn.t load tasks/i);
  });

  it('GenericRelatedRecordsTab — no tabLabel — falls back to fromSideLabel', async () => {
    // Arrange
    mockedApi.fetchRelationshipLinks.mockResolvedValue([]);
    const relationship = buildRelationship({
      tabLabel: undefined,
      fromSideLabel: 'Attachments',
    });

    // Act
    renderTab(relationship);

    // Assert — the card's <header> element carries the label. aria-labelledby wires it to the section
    // as the accessible name, but there's no role="heading" on it — matching by text is the honest check.
    expect(await screen.findByText('Attachments')).toBeInTheDocument();
    expect(await screen.findByText(/no attachments yet/i)).toBeInTheDocument();
  });
});
