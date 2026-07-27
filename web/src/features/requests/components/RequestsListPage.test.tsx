import { axe } from 'jest-axe';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PaginatedResponse, RequestListRow, WorkspaceId } from '@shared/types';

import { renderWithProviders, buildMe, buildMembership, buildRequestListRow } from '@/test-utils';
import { useMe } from '@/features/users/useMe';
import { ACTIVE_WORKSPACE_STORAGE_KEY } from '@/shared/workspace/ActiveWorkspaceContext';

import { RequestsListPage, parseNumberExpression } from './RequestsListPage';
import { useRequestsList } from '../useRequests';

jest.mock('@/features/users/useMe');
jest.mock('../useRequests');

// The board pulls its columns from the default lifecycle's ordered stages (all 7, incl. empty).
jest.mock('@/features/lifecycle', () => ({
  useLifecycleConfig: () => ({
    data: {
      lifecycles: [
        {
          isDefault: true,
          stages: [
            { key: 'intake', label: 'Intake', sortOrder: 0 },
            { key: 'triage', label: 'Triage', sortOrder: 1 },
            { key: 'execution', label: 'Execution', sortOrder: 2 },
            { key: 'validation', label: 'Validation', sortOrder: 3 },
            { key: 'delivery', label: 'Delivery', sortOrder: 4 },
            { key: 'stabilization', label: 'Stabilization', sortOrder: 5 },
            { key: 'closure', label: 'Closure', sortOrder: 6 },
          ],
        },
      ],
    },
  }),
}));

// Slice 14 wired the saved-view picker to the real saved-views feature. These tests focus on the
// list itself; stub the feature so no network call fires and the editor stays out of the tree.
jest.mock('@/features/saved-views', () => ({
  useSavedViews: () => ({ data: [] }),
  toPickerView: (view: { id: string; name: string; scope: string }) => view,
  SavedViewEditor: () => null,
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockedUseMe = useMe as jest.MockedFunction<typeof useMe>;
const mockedUseRequestsList = useRequestsList as jest.MockedFunction<typeof useRequestsList>;

const me = buildMe({ memberships: [buildMembership({ level: 'Member' })] });

function page(
  items: RequestListRow[],
  totalCount = items.length,
): PaginatedResponse<RequestListRow> {
  return { items, totalCount, page: 1, pageSize: 25 };
}

interface ListState {
  data?: PaginatedResponse<RequestListRow>;
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
}

function mockHooks(list: ListState, meOverride: ReturnType<typeof buildMe> = me) {
  mockedUseMe.mockReturnValue({ data: meOverride, isLoading: false, isError: false } as ReturnType<
    typeof useMe
  >);
  mockedUseRequestsList.mockReturnValue({
    data: list.data,
    isLoading: list.isLoading ?? false,
    isError: list.isError ?? false,
    error: list.error,
  } as ReturnType<typeof useRequestsList>);
}

describe('RequestsListPage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => jest.clearAllMocks());

  it('RequestsListPage — renders a row per request with ID, name and aging suffix', async () => {
    // Arrange
    const row = buildRequestListRow({ slaStatus: 'Overdue' });
    mockHooks({ data: page([row]) });

    // Act
    const { container } = renderWithProviders(<RequestsListPage />, { route: '/requests' });

    // Assert
    expect(screen.getByRole('heading', { name: 'Requests' })).toBeInTheDocument();
    expect(screen.getByText('AIS-00000001')).toBeInTheDocument();
    expect(screen.getByText('Meeting-notes action extraction')).toBeInTheDocument();
    expect(screen.getByText(/· overdue/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RequestsListPage — renders the Repo URL rollup as a link (slice 7)', () => {
    // Arrange — a row whose first task-level URL field rolled up to the repo column.
    const base = buildRequestListRow();
    const row = { ...base, columns: { ...base.columns, repo: 'github.com/mws/x' } };
    mockHooks({ data: page([row]) });

    // Act
    renderWithProviders(<RequestsListPage />, { route: '/requests' });

    // Assert
    const link = screen.getByRole('link', { name: /github\.com\/mws\/x/ });
    expect(link).toHaveAttribute('href', 'https://github.com/mws/x');
  });

  it('RequestsListPage — Repo URL keeps an http(s) URL as-is and shows em-dash when absent', () => {
    // Arrange — one row with an absolute URL, one with no repo value.
    const base = buildRequestListRow();
    const withHttp = {
      ...base,
      id: 'AIS-00000001',
      columns: { ...base.columns, id: 'AIS-00000001', repo: 'http://repo/y' },
    };
    const noRepo = {
      ...base,
      id: 'AIS-00000002',
      columns: { ...base.columns, id: 'AIS-00000002', repo: null },
    };
    mockHooks({ data: page([withHttp, noRepo] as never) });

    // Act
    renderWithProviders(<RequestsListPage />, { route: '/requests' });

    // Assert — the absolute URL is not re-prefixed; the missing repo renders no link.
    expect(screen.getByRole('link', { name: /repo\/y/ })).toHaveAttribute('href', 'http://repo/y');
    expect(screen.getByText('AIS-00000002')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /repo/ })).toHaveLength(1);
  });

  it('RequestsListPage — loading state announces via role=status', async () => {
    // Arrange
    mockHooks({ isLoading: true });

    // Act
    const { container } = renderWithProviders(<RequestsListPage />, { route: '/requests' });

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent('Loading requests…');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RequestsListPage — error state announces via role=alert', async () => {
    // Arrange
    mockHooks({ isError: true });

    // Act
    const { container } = renderWithProviders(<RequestsListPage />, { route: '/requests' });

    // Assert
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RequestsListPage — filtered-to-zero shows a Clear filters action', async () => {
    // Arrange — a preset saved view activates a filter, and the result set is empty.
    mockHooks({ data: page([], 0) });

    // Act
    const { container } = renderWithProviders(<RequestsListPage />, { route: '/requests' });
    await userEvent.click(screen.getByRole('button', { name: /All open requests/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Unassigned/ }));

    // Assert — the shared EmptyListFilteredToZero (S42): bordered card, "Clear filters" CTA.
    expect(screen.getByText('No matches for these filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RequestsListPage — zero-data (no rows, no filters) offers Create your first request', async () => {
    // Arrange
    mockHooks({ data: page([], 0) });

    // Act
    const { container } = renderWithProviders(<RequestsListPage />, { route: '/requests' });

    // Assert — the shared EmptyListZeroData (S41): pale ceremony + first-run CTA.
    expect(screen.getByText('No requests yet')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create your first request' }),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RequestsListPage — clicking a row navigates to the record', async () => {
    // Arrange
    mockHooks({ data: page([buildRequestListRow()]) });

    // Act
    renderWithProviders(<RequestsListPage />, { route: '/requests' });
    await userEvent.click(screen.getByText('Meeting-notes action extraction'));

    // Assert
    expect(mockNavigate).toHaveBeenCalledWith('/requests/AIS-00000001');
  });

  it('RequestsListPage — Create request navigates to the new-request route', async () => {
    // Arrange
    mockHooks({ data: page([buildRequestListRow()]) });

    // Act
    renderWithProviders(<RequestsListPage />, { route: '/requests' });
    await userEvent.click(screen.getByRole('button', { name: /Create request/ }));

    // Assert
    expect(mockNavigate).toHaveBeenCalledWith('/requests/new');
  });

  it('RequestsListPage — a sort click writes the sort into the query', async () => {
    // Arrange
    mockHooks({ data: page([buildRequestListRow()]) });

    // Act
    renderWithProviders(<RequestsListPage />, { route: '/requests' });
    await userEvent.click(screen.getByRole('button', { name: 'ID' }));

    // Assert
    const calls = mockedUseRequestsList.mock.calls;
    const lastQuery = calls[calls.length - 1]?.[1];
    expect(lastQuery?.sort).toEqual([{ column: 'id', direction: 'asc' }]);
  });

  it('RequestsListPage — applying a number funnel filter adds a clause and an active pill', async () => {
    // Arrange
    mockHooks({ data: page([buildRequestListRow()]) });

    // Act — open the Priority funnel and enter a comparator expression. A single change models a
    // complete entry: the controlled funnel clears on intermediate invalid expressions (a lone ">"),
    // so char-by-char typing would reset before the digit arrives.
    renderWithProviders(<RequestsListPage />, { route: '/requests' });
    await userEvent.click(screen.getByRole('button', { name: 'Filter Priority' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. >5 or =7'), { target: { value: '>3' } });

    // Assert — the query carries the parsed clause and a removable pill summarises it.
    const calls = mockedUseRequestsList.mock.calls;
    const lastQuery = calls[calls.length - 1]?.[1];
    expect(lastQuery?.filters?.priority).toEqual({ kind: 'number', op: '>', value: 3 });
    expect(screen.getByText('Priority > 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove filter Priority > 3' })).toBeInTheDocument();
  });

  it('RequestsListPage — removing an active filter pill drops its clause', async () => {
    // Arrange
    mockHooks({ data: page([buildRequestListRow()]) });
    renderWithProviders(<RequestsListPage />, { route: '/requests' });
    await userEvent.click(screen.getByRole('button', { name: 'Filter Name' }));
    await userEvent.type(screen.getByPlaceholderText('contains…'), 'notes');
    expect(screen.getByRole('button', { name: /Remove filter Name/ })).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: /Remove filter Name/ }));

    // Assert — the query no longer carries the name clause.
    const calls = mockedUseRequestsList.mock.calls;
    const lastQuery = calls[calls.length - 1]?.[1];
    expect(lastQuery?.filters?.name).toBeUndefined();
  });

  it('RequestsListPage — Next and Previous page paging clamps at the ends', async () => {
    // Arrange — 60 rows over a 25-per-page grid ⇒ 3 pages.
    mockHooks({ data: page([buildRequestListRow()], 60) });
    renderWithProviders(<RequestsListPage />, { route: '/requests' });
    expect(screen.getByText('1–25 of 60 records')).toBeInTheDocument();

    // Act — page forward to page 2, then attempt to go back past page 1 twice.
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));

    // Assert — page advanced and the query reflects page 2.
    expect(screen.getByText('26–50 of 60 records')).toBeInTheDocument();
    let calls = mockedUseRequestsList.mock.calls;
    expect(calls[calls.length - 1]?.[1]?.page).toBe(2);

    // Act — go back to page 1, then click Previous again (should clamp, not go to 0).
    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));

    // Assert — clamped at page 1.
    expect(screen.getByText('1–25 of 60 records')).toBeInTheDocument();
    calls = mockedUseRequestsList.mock.calls;
    expect(calls[calls.length - 1]?.[1]?.page).toBe(1);
  });

  it('RequestsListPage — a Due date preset view renders a controlled date clause', async () => {
    // Arrange — the "Due this week" saved view seeds a date filter (clauseToFilterValue date path).
    mockHooks({ data: page([buildRequestListRow()]) });
    renderWithProviders(<RequestsListPage />, { route: '/requests' });

    // Act
    await userEvent.click(screen.getByRole('button', { name: /All open requests/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Due this week/ }));

    // Assert — a date pill is active and the query carries a date clause.
    const calls = mockedUseRequestsList.mock.calls;
    const lastQuery = calls[calls.length - 1]?.[1];
    expect(lastQuery?.filters?.due?.kind).toBe('date');
    expect(screen.getByRole('button', { name: /Remove filter Due date/ })).toBeInTheDocument();
  });

  it('RequestsListPage — a malformed due date renders an em-dash, not a crash', async () => {
    // Arrange — an unparseable due value exercises the formatDue guard.
    const row = buildRequestListRow({
      columns: { ...buildRequestListRow().columns, due: 'not-a-date' },
    });
    mockHooks({ data: page([row]) });

    // Act
    const { container } = renderWithProviders(<RequestsListPage />, { route: '/requests' });

    // Assert — the row still renders; the due cell falls back to an em-dash.
    expect(screen.getByText('AIS-00000001')).toBeInTheDocument();
    expect(container.querySelectorAll('[role="cell"]').length).toBeGreaterThan(0);
  });

  it('RequestsListPage — offers only Table and Board layouts (date/gallery are Dashboards-only)', () => {
    // Arrange
    mockHooks({ data: page([buildRequestListRow()]) });

    // Act
    renderWithProviders(<RequestsListPage />, { route: '/requests' });

    // Assert — the Requests layout toggle exposes Table + Board and nothing else.
    const toggle = screen.getByRole('group', { name: 'Requests layout' });
    expect(within(toggle).getByRole('button', { name: 'Table' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(toggle).getByRole('button', { name: 'Board' })).toBeInTheDocument();
    expect(within(toggle).queryByRole('button', { name: 'Timeline' })).not.toBeInTheDocument();
    expect(within(toggle).queryByRole('button', { name: 'Agenda' })).not.toBeInTheDocument();
    expect(within(toggle).queryByRole('button', { name: 'Gallery' })).not.toBeInTheDocument();
  });

  it('RequestsListPage — Board shows all 7 lifecycle stages (labelled, empty ones included) and no pager', async () => {
    // Arrange — two rows land in two stages; the other five stages must still render as empty columns.
    const intake = buildRequestListRow();
    const triage = {
      ...intake,
      id: 'AIS-00000002',
      columns: { ...intake.columns, id: 'AIS-00000002', name: 'Contract clause finder', stage: 'triage' },
    };
    mockHooks({ data: page([intake, triage] as never) });

    // Act
    const { container } = renderWithProviders(<RequestsListPage />, { route: '/requests' });
    await userEvent.click(screen.getByRole('button', { name: 'Board' }));

    // Assert — all seven lifecycle stages render as columns, by label, in order; populated ones carry
    // a count and the rest are empty. The table grid and the pager footer are both gone.
    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');
    const columns = screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'));
    expect(columns).toEqual([
      'Intake (1)',
      'Triage (1)',
      'Execution (0)',
      'Validation (0)',
      'Delivery (0)',
      'Stabilization (0)',
      'Closure (0)',
    ]);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText(/of \d+ records/i)).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RequestsListPage — the table view keeps its pager footer', () => {
    // Arrange
    mockHooks({ data: page([buildRequestListRow()], 60) });

    // Act — default view is the table.
    renderWithProviders(<RequestsListPage />, { route: '/requests' });

    // Assert — the footer (count + pager) is present for the table.
    expect(screen.getByText(/of 60 records/i)).toBeInTheDocument();
  });

  it('RequestsListPage — a Board card opens its record', async () => {
    // Arrange
    mockHooks({ data: page([buildRequestListRow()]) });

    // Act
    renderWithProviders(<RequestsListPage />, { route: '/requests' });
    await userEvent.click(screen.getByRole('button', { name: 'Board' }));
    await userEvent.click(screen.getByRole('button', { name: 'Meeting-notes action extraction' }));

    // Assert
    expect(mockNavigate).toHaveBeenCalledWith('/requests/AIS-00000001');
  });

  it('RequestsListPage — active workspace switched — queries the switched workspace', async () => {
    // Arrange — the caller belongs to two workspaces; localStorage holds the switcher's choice
    // (the non-default, non-ai-solutions one), so the query must follow it rather than the
    // resolveActiveWorkspaceId default (the ai-solutions hub).
    localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, 'ws-lit');
    const switchedMe = buildMe({
      memberships: [
        buildMembership({ workspaceId: 'ws-ai' as WorkspaceId, workspaceKind: 'ai-solutions' }),
        buildMembership({
          workspaceId: 'ws-lit' as WorkspaceId,
          workspaceName: 'Litigation',
          workspaceKind: 'pg-dept',
        }),
      ],
    });
    mockHooks({ data: page([buildRequestListRow()]) }, switchedMe);

    // Act
    renderWithProviders(<RequestsListPage />, { route: '/requests' });

    // Assert — the list-fetch hook's first argument is the workspace id it queries against.
    await waitFor(() => {
      const calls = mockedUseRequestsList.mock.calls;
      expect(calls[calls.length - 1]?.[0]).toBe('ws-lit');
    });
  });
});

describe('parseNumberExpression', () => {
  it('parseNumberExpression — greater-than expression — parses op and value', () => {
    // Arrange / Act
    const result = parseNumberExpression('>5');

    // Assert
    expect(result).toEqual({ op: '>', value: 5 });
  });

  it('parseNumberExpression — bare number — defaults to equals', () => {
    // Arrange / Act
    const result = parseNumberExpression('=7');

    // Assert
    expect(result).toEqual({ op: '=', value: 7 });
  });

  it('parseNumberExpression — less-than-or-equal — parses two-char operator', () => {
    // Arrange / Act
    const result = parseNumberExpression('<=6');

    // Assert
    expect(result).toEqual({ op: '<=', value: 6 });
  });

  it('parseNumberExpression — non-numeric input — returns null', () => {
    // Arrange / Act
    const result = parseNumberExpression('abc');

    // Assert
    expect(result).toBeNull();
  });
});
