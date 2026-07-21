// Tests for the S4 Record detail page (non-escalated). Mocks the Requests hooks and the field-schema
// API so the component's own composition, autosave debounce, and 403 no-access surface are exercised
// without the network. Every rendered state carries a jest-axe assertion (web-testing.md).

import { Route, Routes } from 'react-router-dom';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { RequestDto, WorkspaceFieldSchemaDto, WorkspaceId } from '@shared/types';

import { buildFieldDefinition, buildMe, buildMembership, buildRequestDto, renderWithProviders } from '@/test-utils';
import { ApiError } from '@/shared/http/apiClient';
import * as fieldsApi from '@/features/fields/api';
import * as useMeModule from '@/features/users/useMe';

import * as useRequests from '../useRequests';
import { RecordDetailPage, SAVE_DEBOUNCE_MS } from './RecordDetailPage';

expect.extend(toHaveNoViolations);

jest.mock('../useRequests');
jest.mock('@/features/fields/api');
jest.mock('@/features/users/useMe');
// The Status tab hosts the Relationships card (slice 10), which fetches the record's typed links.
// Mock the boundary so these tests stay network-free and the card renders its empty state.
jest.mock('@/features/typed-links/api', () => ({
  fetchRecordLinks: jest.fn().mockResolvedValue([]),
  addRecordLink: jest.fn(),
  deleteRecordLink: jest.fn(),
  copyRecord: jest.fn(),
}));
// The Watchers & alerts tab hosts the Watchers card (slice 12), which fetches the record's watchers.
// Mock the boundary so these tests stay network-free and the card renders its empty state.
jest.mock('@/features/watchers/api', () => ({
  fetchWatchers: jest.fn().mockResolvedValue({
    watchers: [],
    isWatching: false,
    myPreferences: {
      notifyGateDecisions: true,
      notifyStatusChanges: true,
      notifyTaskSignoffs: true,
      notifySlaAndDueDateReminders: true,
      notifyMentionsAndComments: true,
    },
  }),
  watchRecord: jest.fn(),
  unwatchRecord: jest.fn(),
}));
// The config-driven tab bar (slice 25) reads workspace Relationships via fetchRelationships.
// Default to an empty list so the base tab bar shape stays unchanged for these tests.
jest.mock('@/features/relationships/api', () => ({
  fetchRelationships: jest.fn().mockResolvedValue([]),
  fetchRelationship: jest.fn(),
  createRelationship: jest.fn(),
  patchRelationship: jest.fn(),
  retireRelationship: jest.fn(),
  restoreRelationship: jest.fn(),
  fetchRelationshipLinks: jest.fn().mockResolvedValue([]),
  createRelationshipLink: jest.fn(),
  deleteRelationshipLink: jest.fn(),
}));

const patchMutate = jest.fn();
const setStageMutate = jest.fn();
const setStatusHoldMutate = jest.fn();

const SCHEMA: WorkspaceFieldSchemaDto = {
  workspaceId: 'ws-1' as WorkspaceId,
  objectType: 'Request',
  platformFields: [],
  fields: [
    buildFieldDefinition({ fieldKey: 'name', displayName: 'Name', fieldType: 'ShortText', isRequired: true, sortOrder: 1 }),
    buildFieldDefinition({
      id: '00000000-0000-0000-0000-0000000000f2' as ReturnType<typeof buildFieldDefinition>['id'],
      fieldKey: 'description',
      displayName: 'Description',
      fieldType: 'LongText',
      isRequired: false,
      sortOrder: 2,
    }),
  ],
};

function queryResult(data: RequestDto) {
  return { data, isLoading: false, isError: false, error: null } as unknown as ReturnType<typeof useRequests.useRequest>;
}

function errorResult(error: unknown) {
  return {
    data: undefined,
    isLoading: false,
    isError: true,
    error,
  } as unknown as ReturnType<typeof useRequests.useRequest>;
}

function asMutation(mutate: jest.Mock) {
  return { mutate, isError: false, isPending: false, error: null };
}

function seedDefaults() {
  jest.mocked(useRequests.useRequest).mockReturnValue(queryResult(buildRequestDto()));
  jest
    .mocked(useRequests.usePatchRequest)
    .mockReturnValue(asMutation(patchMutate) as unknown as ReturnType<typeof useRequests.usePatchRequest>);
  jest
    .mocked(useRequests.useSetStatusHold)
    .mockReturnValue(
      asMutation(setStatusHoldMutate) as unknown as ReturnType<typeof useRequests.useSetStatusHold>,
    );
  jest
    .mocked(useRequests.useSetStage)
    .mockReturnValue(asMutation(setStageMutate) as unknown as ReturnType<typeof useRequests.useSetStage>);
  jest.mocked(fieldsApi.fetchWorkspaceFields).mockResolvedValue(SCHEMA);
  // Default membership: the record's own workspace as the AI Solutions hub — escalation is not offered.
  jest
    .mocked(useMeModule.useMe)
    .mockReturnValue({ data: buildMe({ memberships: [buildMembership()] }) } as unknown as ReturnType<typeof useMeModule.useMe>);
}

const PG_WORKSPACE = 'ws-pg' as WorkspaceId;

/** A record escalated FROM Litigation, viewed on the given side (defaults to the AI side). */
function escalatedRecord(overrides: Partial<RequestDto> = {}) {
  return buildRequestDto({
    bridge: {
      isEscalated: true,
      originWorkspaceId: PG_WORKSPACE,
      originWorkspaceName: 'Litigation',
      aiWorkspaceId: 'ws-1' as WorkspaceId,
      escalatedAt: '2026-07-04T18:00:00Z',
      aiSolutionsStatus: 'Execution',
      lockedFields: ['name'],
    },
    ...overrides,
  });
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/requests/:recordId" element={<RecordDetailPage />} />
    </Routes>,
    { route: '/requests/AIS-00000001' },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  seedDefaults();
});

describe('RecordDetailPage', () => {
  it('RecordDetailPage — renders the breadcrumb, name, five meta fields, stepper, and six tabs', async () => {
    // Arrange / Act
    const { container } = renderPage();

    // Assert
    expect(await screen.findByText('Meeting-notes action extraction')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Requests' })).toBeInTheDocument();
    expect(screen.getByText('Display status')).toBeInTheDocument();
    expect(screen.getByText('Assigned analyst')).toBeInTheDocument();
    expect(screen.getByText('Priority score')).toBeInTheDocument();
    expect(screen.getByText('Due date')).toBeInTheDocument();
    expect(screen.getByText('Time in stage')).toBeInTheDocument();
    expect(container.querySelector('[data-ds="stepper"]')).toBeInTheDocument();

    const tablist = screen.getByRole('tablist', { name: 'Record sections' });
    expect(within(tablist).getAllByRole('tab')).toHaveLength(6);

    expect(await axe(container)).toHaveNoViolations();
  });

  it('RecordDetailPage — time-in-stage shows in the meta strip and the SLA pill reflects Overdue', async () => {
    // Arrange — an overdue record parked five days in its current stage.
    jest.mocked(useRequests.useRequest).mockReturnValue(
      queryResult(buildRequestDto({ slaStatus: 'Overdue', timeInStage: { stageKey: 'intake', days: 5 } })),
    );

    // Act
    const { container } = renderPage();

    // Assert — meta strip carries the day count; the Intake read-only SLA slot renders the pill.
    expect(await screen.findByText('5 days')).toBeInTheDocument();
    expect(await screen.findByText('Overdue')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RecordDetailPage — a Due-soon SLA renders the "Due soon" pill and singular/Today time-in-stage', async () => {
    // Arrange — due soon, entered the stage today (0 days → "Today").
    jest.mocked(useRequests.useRequest).mockReturnValue(
      queryResult(buildRequestDto({ slaStatus: 'DueSoon', timeInStage: { stageKey: 'intake', days: 0 } })),
    );

    // Act
    renderPage();

    // Assert
    expect(await screen.findByText('Due soon')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('RecordDetailPage — no due date shows no SLA pill and an em-dash time-in-stage', async () => {
    // Arrange — slaStatus omitted (no due date) and no time-in-stage.
    jest.mocked(useRequests.useRequest).mockReturnValue(queryResult(buildRequestDto()));

    // Act
    renderPage();

    // Assert — neither SLA state label appears; the SLA slot and time-in-stage fall back to em-dash.
    expect(await screen.findByText('Meeting-notes action extraction')).toBeInTheDocument();
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
    expect(screen.queryByText('Due soon')).not.toBeInTheDocument();
    expect(screen.queryByText('On track')).not.toBeInTheDocument();
  });

  it('RecordDetailPage — Intake tab renders editable fields seeded from the record', async () => {
    // Arrange
    jest.mocked(useRequests.useRequest).mockReturnValue(
      queryResult(buildRequestDto({ fields: { name: 'Meeting notes', description: 'Existing summary' } })),
    );

    // Act
    const { container } = renderPage();

    // Assert
    const nameInput = await screen.findByLabelText('Name');
    expect(nameInput).toHaveValue('Meeting notes');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RecordDetailPage — editing a field debounces one patch and shows the saved indicator', async () => {
    // Arrange
    jest.mocked(useRequests.useRequest).mockReturnValue(
      queryResult(buildRequestDto({ fields: { name: 'Meeting notes' } })),
    );
    const { container } = renderPage();
    const nameInput = await screen.findByLabelText('Name');

    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    // Act
    await user.type(nameInput, '!');

    // Assert — not fired until the debounce elapses
    expect(patchMutate).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });
    expect(patchMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByText('All changes saved')).toBeInTheDocument();

    jest.useRealTimers();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RecordDetailPage — Status tab: choosing On hold and updating calls setStatusHold with the tri-state + note + ETag', async () => {
    // Slice 26 — the tri-state PATCH carries statusHold + note + the record's current ETag.
    // Arrange
    const user = userEvent.setup();
    const { container } = renderPage();

    // Act
    await user.click(await screen.findByRole('tab', { name: 'Status' }));
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Status override' }),
      'OnHold',
    );
    await user.type(screen.getByLabelText('Note'), 'Waiting on client');
    await user.click(screen.getByRole('button', { name: 'Update status' }));

    // Assert
    expect(setStatusHoldMutate).toHaveBeenCalledWith({
      etag: expect.any(String),
      statusHold: 'OnHold',
      statusHoldNote: 'Waiting on client',
    });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RecordDetailPage — loading — announces via role=status', async () => {
    // Arrange
    jest.mocked(useRequests.useRequest).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useRequests.useRequest>);

    // Act
    const { container } = renderPage();

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent('Loading record…');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RecordDetailPage — a non-403 error renders the generic error alert', async () => {
    // Arrange — a 500 is not a forbidden case, so the no-access surface must not appear.
    jest.mocked(useRequests.useRequest).mockReturnValue(
      errorResult(new ApiError(500, { type: 'about:blank', title: 'Server error', status: 500, detail: 'Server exploded.' })),
    );

    // Act
    const { container } = renderPage();

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('Server exploded.');
    expect(screen.queryByText(/access to this record/i)).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RecordDetailPage — Status tab: Move stage calls setStage with the chosen stage', async () => {
    // Arrange
    const user = userEvent.setup();
    const { container } = renderPage();

    // Act
    await user.click(await screen.findByRole('tab', { name: 'Status' }));
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Stage' }), 'execution');
    await user.click(screen.getByRole('button', { name: 'Move stage' }));

    // Assert
    expect(setStageMutate).toHaveBeenCalledWith('execution');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RecordDetailPage — Status tab: keeping In progress calls setStatusHold with a null note', async () => {
    // Slice 26 — the tri-state default lands on InProgress; the button always fires (no dirty check),
    // so the mutation is called with `statusHold: 'InProgress'` and no note.
    // Arrange
    const user = userEvent.setup();
    renderPage();

    // Act
    await user.click(await screen.findByRole('tab', { name: 'Status' }));
    await user.click(screen.getByRole('button', { name: 'Update status' }));

    // Assert
    expect(setStatusHoldMutate).toHaveBeenCalledWith({
      etag: expect.any(String),
      statusHold: 'InProgress',
      statusHoldNote: null,
    });
  });

  it('RecordDetailPage — the Watchers & alerts tab renders the live watchers card', async () => {
    // Arrange — Watchers & alerts is a live feature now (slice 12); the card fetches the roster.
    const user = userEvent.setup();
    const { container } = renderPage();

    // Act
    await user.click(await screen.findByRole('tab', { name: 'Watchers & alerts' }));

    // Assert — the card renders its empty state + the always-visible notification rules + Active alerts.
    expect(await screen.findByText('No one is watching this record yet.')).toBeInTheDocument();
    expect(screen.getByText('Notify watchers about')).toBeInTheDocument();
    expect(screen.getByText('Active alerts')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RecordDetailPage — a 403 renders the no-access surface and hides the record name', async () => {
    // Arrange
    jest.mocked(useRequests.useRequest).mockReturnValue(
      errorResult(
        new ApiError(403, { type: 'about:blank', title: 'Forbidden', status: 403, detail: 'Forbidden.' }),
      ),
    );

    // Act
    const { container } = renderPage();

    // Assert
    expect(screen.getByText(/access to this record/i)).toBeInTheDocument();
    expect(screen.queryByText('Meeting-notes action extraction')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RecordDetailPage — escalated record (S5) shows the origin pill, mirror note, and locks the crossing field on the PG side', async () => {
    // Arrange — viewed on the PG side (record workspace ≠ AI workspace), so crossing fields lock.
    jest
      .mocked(useRequests.useRequest)
      .mockReturnValue(queryResult(escalatedRecord({ workspaceId: PG_WORKSPACE })));

    // Act
    const { container } = renderPage();

    // Assert — the "Escalated · [origin]" pill, the slim mirror note, and a disabled crossed field.
    // The note lives inside the schema-gated Intake tab, so await it (the schema query resolves async).
    expect(await screen.findByText('Escalated · Litigation')).toBeInTheDocument();
    const note = await screen.findByRole('complementary', { name: 'Escalation bridge' });
    expect(note).toHaveTextContent('AI Solutions Status');
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(screen.getByText('Crossed · locked on PG')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RecordDetailPage — escalated record on the AI side keeps the crossing field editable', async () => {
    // Arrange — viewed on the AI side (record workspace == AI workspace); the lock is conceptual there.
    jest.mocked(useRequests.useRequest).mockReturnValue(queryResult(escalatedRecord()));

    // Act
    renderPage();

    // Assert — the marker still shows, but the field is editable (fully editable AI-side).
    expect(await screen.findByText('Crossed · locked on PG')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeEnabled();
  });

  it('RecordDetailPage — a PG member sees the Escalate action and can open the confirm modal', async () => {
    // Arrange — a non-escalated record on a PG workspace the caller belongs to.
    const user = userEvent.setup();
    jest
      .mocked(useRequests.useRequest)
      .mockReturnValue(queryResult(buildRequestDto({ workspaceId: PG_WORKSPACE })));
    jest.mocked(useMeModule.useMe).mockReturnValue({
      data: buildMe({ memberships: [buildMembership({ workspaceId: PG_WORKSPACE, workspaceKind: 'pg-dept' })] }),
    } as unknown as ReturnType<typeof useMeModule.useMe>);

    // Act
    const { container } = renderPage();
    await user.click(await screen.findByRole('tab', { name: 'Status' }));
    await user.click(await screen.findByRole('button', { name: 'Escalate to AI Solutions' }));

    // Assert — the confirm-and-lock modal opens.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/shares this record’s ID/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RecordDetailPage — the Escalate action is hidden on the AI Solutions workspace', async () => {
    // Arrange — the default seed puts the record on the AI hub; escalation makes no sense there.
    const user = userEvent.setup();

    // Act
    renderPage();
    await user.click(await screen.findByRole('tab', { name: 'Status' }));

    // Assert
    expect(screen.queryByRole('button', { name: 'Escalate to AI Solutions' })).not.toBeInTheDocument();
  });

  it('RecordDetailPage — admin-authored relationship injects a tab; system relationships do not', async () => {
    // Arrange — one admin-authored + one system-seeded Relationship. Only the admin-authored one
    // should surface as a new tab; system rows model existing base tabs and would duplicate them.
    const { buildRelationship } = await import('@/test-utils');
    const relationshipsApi = await import('@/features/relationships/api');
    jest.mocked(relationshipsApi.fetchRelationships).mockResolvedValue([
      buildRelationship({
        id: 'sys-1' as ReturnType<typeof buildRelationship>['id'],
        name: 'Request has Tasks (system)',
        isSystem: true,
        tabLabel: 'Tasks',
      }),
      buildRelationship({
        id: 'user-1' as ReturnType<typeof buildRelationship>['id'],
        name: 'Request has Deliverables',
        toObjectType: 'Feature',
        fromSideLabel: 'Deliverables',
        tabLabel: 'Deliverables',
        showOnFromAsTab: true,
        sortOrder: 100,
      }),
    ]);

    // Act
    renderPage();

    // Assert — the base six tabs plus one admin-authored relationship tab; system row is filtered out.
    const tablist = await screen.findByRole('tablist', { name: 'Record sections' });
    const tabs = await within(tablist).findAllByRole('tab');
    expect(tabs).toHaveLength(7);
    expect(within(tablist).getByRole('tab', { name: 'Deliverables' })).toBeInTheDocument();
  });
});
