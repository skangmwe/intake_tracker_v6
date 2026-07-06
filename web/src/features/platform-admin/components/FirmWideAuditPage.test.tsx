// FirmWideAuditPage (S39) — the platform-admin gate + filtered, paginated firm-wide audit read.
// jest-axe runs against each meaningfully different rendered state (web-testing.md). Covers
// FirmAuditFilterBar (apply/clear) and FirmWideAuditTable, plus the pagination controls, through the
// page. The real audit-feature event helpers run (only the platform-admin api + /users/me are mocked).

import { axe } from 'jest-axe';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { EventType, FirmWideAuditRowDto, MeDto, PaginatedResponse } from '@shared/types';

import { buildMe, renderWithProviders } from '@/test-utils';
import { fetchMe } from '@/features/users/api';

import { queryFirmWideAudit } from '../api';
import { FirmWideAuditPage } from './FirmWideAuditPage';

jest.mock('../api');
jest.mock('@/features/users/api');
const mockedQuery = queryFirmWideAudit as jest.MockedFunction<typeof queryFirmWideAudit>;
const mockedFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;

const adminMe = () => buildMe({ isPlatformAdmin: true });

const row = (over: Partial<FirmWideAuditRowDto> = {}): FirmWideAuditRowDto => ({
  auditId: '11111111-0000-4000-8000-000000000001',
  workspaceId: 'ws-9' as FirmWideAuditRowDto['workspaceId'],
  workspaceName: 'Litigation',
  recordId: 'LIT-00000001' as FirmWideAuditRowDto['recordId'],
  objectType: 'Request',
  eventType: 'request.created' as EventType,
  actorUserId: null,
  actorName: null,
  eventAt: '2026-07-02T10:00:00Z',
  payload: '{}',
  ...over,
});

const page = (over: Partial<PaginatedResponse<FirmWideAuditRowDto>> = {}): PaginatedResponse<FirmWideAuditRowDto> => ({
  items: [row()],
  totalCount: 1,
  page: 1,
  pageSize: 25,
  ...over,
});

function renderPage(me: MeDto) {
  mockedFetchMe.mockResolvedValue(me);
  return renderWithProviders(<FirmWideAuditPage />, { seedMe: me });
}

beforeEach(() => jest.clearAllMocks());

describe('FirmWideAuditPage', () => {
  it('renders the firm-wide audit rows for a platform admin', async () => {
    mockedQuery.mockResolvedValue(page());
    const { container } = renderPage(adminMe());
    expect(await screen.findByRole('table', { name: /firm-wide audit/i })).toBeInTheDocument();
    expect(screen.getByText('Litigation')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders a named actor and expandable payload details', async () => {
    mockedQuery.mockResolvedValue(
      page({
        items: [
          row({
            actorUserId: '00000000-0000-4000-8000-0000000000aa' as FirmWideAuditRowDto['actorUserId'],
            actorName: 'Dana Admin',
            payload: '{"from":"Draft","to":"Published"}',
          }),
        ],
      }),
    );
    const user = userEvent.setup();
    const { container } = renderPage(adminMe());
    await screen.findByRole('table', { name: /firm-wide audit/i });

    expect(screen.getByText('Dana Admin')).toBeInTheDocument();
    // The non-empty payload is disclosed behind a <details> toggle (the <summary>, not the column header).
    await user.click(screen.getByText('Details', { selector: 'summary' }));
    expect(screen.getByText(/"from": "Draft"/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the filtered-to-zero card when nothing matches', async () => {
    mockedQuery.mockResolvedValue(page({ items: [], totalCount: 0 }));
    const { container } = renderPage(adminMe());
    expect(await screen.findByText(/no matching activity/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the error state when the log fails', async () => {
    mockedQuery.mockRejectedValue(new Error('boom'));
    const { container } = renderPage(adminMe());
    expect(await screen.findByText(/firm-wide audit log could not be loaded/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('warns and does not fetch for a non-admin', async () => {
    const { container } = renderPage(buildMe({ isPlatformAdmin: false }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/available to platform admins/i);
    expect(mockedQuery).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('applies an event-type filter', async () => {
    mockedQuery.mockResolvedValue(page());
    const user = userEvent.setup();
    renderPage(adminMe());
    await screen.findByRole('table', { name: /firm-wide audit/i });

    await user.selectOptions(screen.getByLabelText(/event type/i), 'request.created');
    await user.click(screen.getByRole('button', { name: /apply filters/i }));

    await waitFor(() =>
      expect(mockedQuery.mock.calls.some(([query]) => query.eventType === 'request.created')).toBe(true),
    );
  });

  it('pages forward when there is more than one page', async () => {
    mockedQuery.mockResolvedValue(page({ totalCount: 30 }));
    const user = userEvent.setup();
    renderPage(adminMe());
    await screen.findByRole('table', { name: /firm-wide audit/i });

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(mockedQuery.mock.calls.some(([query]) => query.page === 2)).toBe(true));
  });
});
