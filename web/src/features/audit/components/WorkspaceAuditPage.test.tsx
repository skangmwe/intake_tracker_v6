// Tests for WorkspaceAuditPage — the admin gate (non-admin sees a warning, admin sees the log),
// loading / error / filtered-to-zero states, the row render, and pagination. The data hooks (useMe,
// useMembers, useWorkspaceAudit) are mocked so each state is deterministic — useMe is mocked (rather
// than seeded) so a stale-query refetch can't flip the gate mid-interaction. jest-axe runs on every
// meaningfully different rendered state (web/CLAUDE.md).

import { axe } from 'jest-axe';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AuditLogRowDto, MeDto, RecordId, UserId, WorkspaceId } from '@shared/types';

import { buildMe, buildMember, buildMembership, renderWithProviders } from '@/test-utils';

import * as auditHook from '../useWorkspaceAudit';
import * as membersHook from '@/features/users/useMembers';
import * as meHook from '@/features/users/useMe';
import { WorkspaceAuditPage } from './WorkspaceAuditPage';

jest.mock('../useWorkspaceAudit');
jest.mock('@/features/users/useMembers');
jest.mock('@/features/users/useMe');

const mockedAudit = auditHook as jest.Mocked<typeof auditHook>;
const mockedMembers = membersHook as jest.Mocked<typeof membersHook>;
const mockedMe = meHook as jest.Mocked<typeof meHook>;

const ADMIN_ME = buildMe({ memberships: [buildMembership({ level: 'WorkspaceAdmin' })] });
const MEMBER_ME = buildMe({ memberships: [buildMembership({ level: 'Member' })] });

type AuditResult = ReturnType<typeof auditHook.useWorkspaceAudit>;
type MeResult = ReturnType<typeof meHook.useMe>;

function mockMe(me: MeDto) {
  mockedMe.useMe.mockReturnValue({ data: me, isLoading: false, isError: false } as MeResult);
}

function auditResult(overrides: Partial<AuditResult>): AuditResult {
  return { data: undefined, isLoading: false, isError: false, ...overrides } as AuditResult;
}

function buildRow(overrides: Partial<AuditLogRowDto> = {}): AuditLogRowDto {
  return {
    auditId: '00000000-0000-0000-0000-0000000000e1',
    workspaceId: 'ws-1' as WorkspaceId,
    recordId: 'AIS-00000001' as RecordId,
    objectType: 'Request',
    eventType: 'request.created',
    actorUserId: '00000000-0000-0000-0000-0000000000a1' as UserId,
    actorName: 'Ada Analyst',
    eventAt: '2026-07-02T10:00:00Z',
    payload: '{}',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMe(ADMIN_ME);
  mockedMembers.useMembers.mockReturnValue({
    data: { members: [buildMember({ displayName: 'Ada Analyst' })] },
  } as ReturnType<typeof membersHook.useMembers>);
});

it('WorkspaceAuditPage — non-admin — shows a warning and no table', async () => {
  // Arrange
  mockMe(MEMBER_ME);
  mockedAudit.useWorkspaceAudit.mockReturnValue(auditResult({}));

  // Act
  const { container } = renderWithProviders(<WorkspaceAuditPage />);

  // Assert
  expect(screen.getByRole('alert')).toHaveTextContent(/available to workspace admins/i);
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('WorkspaceAuditPage — admin, loading — shows a status message', async () => {
  // Arrange
  mockedAudit.useWorkspaceAudit.mockReturnValue(auditResult({ isLoading: true }));

  // Act
  const { container } = renderWithProviders(<WorkspaceAuditPage />);

  // Assert
  expect(screen.getByRole('status')).toHaveTextContent(/loading audit entries/i);
  expect(await axe(container)).toHaveNoViolations();
});

it('WorkspaceAuditPage — admin, error — shows an error alert', async () => {
  // Arrange
  mockedAudit.useWorkspaceAudit.mockReturnValue(auditResult({ isError: true }));

  // Act
  const { container } = renderWithProviders(<WorkspaceAuditPage />);

  // Assert
  expect(screen.getByRole('alert')).toHaveTextContent(/could not be loaded/i);
  expect(await axe(container)).toHaveNoViolations();
});

it('WorkspaceAuditPage — admin, empty — shows the filtered-to-zero state', async () => {
  // Arrange
  mockedAudit.useWorkspaceAudit.mockReturnValue(
    auditResult({ data: { items: [], totalCount: 0, page: 1, pageSize: 25 } }),
  );

  // Act
  const { container } = renderWithProviders(<WorkspaceAuditPage />);

  // Assert
  expect(screen.getByText(/no matching activity/i)).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('WorkspaceAuditPage — admin, rows — renders the log table and count', async () => {
  // Arrange
  mockedAudit.useWorkspaceAudit.mockReturnValue(
    auditResult({ data: { items: [buildRow()], totalCount: 1, page: 1, pageSize: 25 } }),
  );

  // Act
  const { container } = renderWithProviders(<WorkspaceAuditPage />);

  // Assert — scope to the table (the event label also appears as a filter-bar select option).
  const table = screen.getByRole('table');
  expect(within(table).getByText('Request created')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(/showing 1–1 of 1 entry/i);
  expect(await axe(container)).toHaveNoViolations();
});

it('WorkspaceAuditPage — multiple pages — Next advances and refetches', async () => {
  // Arrange — 30 total over page size 25 → 2 pages.
  const user = userEvent.setup();
  mockedAudit.useWorkspaceAudit.mockReturnValue(
    auditResult({ data: { items: [buildRow()], totalCount: 30, page: 1, pageSize: 25 } }),
  );
  renderWithProviders(<WorkspaceAuditPage />);

  // Act
  await user.click(screen.getByRole('button', { name: /next/i }));

  // Assert — the hook is re-invoked with page 2 in the query.
  expect(mockedAudit.useWorkspaceAudit).toHaveBeenCalledWith(
    'ws-1',
    expect.objectContaining({ page: 2 }),
  );
});

it('WorkspaceAuditPage — applying a filter resets to page 1 and passes it through', async () => {
  // Arrange
  const user = userEvent.setup();
  mockedAudit.useWorkspaceAudit.mockReturnValue(
    auditResult({ data: { items: [buildRow()], totalCount: 1, page: 1, pageSize: 25 } }),
  );
  renderWithProviders(<WorkspaceAuditPage />);

  // Act — pick an event type and apply.
  await user.selectOptions(screen.getByLabelText(/event type/i), 'request.created');
  await user.click(screen.getByRole('button', { name: /apply filters/i }));

  // Assert — the query carries the chosen filter at page 1.
  expect(mockedAudit.useWorkspaceAudit).toHaveBeenCalledWith(
    'ws-1',
    expect.objectContaining({ page: 1, eventType: 'request.created' }),
  );
});
