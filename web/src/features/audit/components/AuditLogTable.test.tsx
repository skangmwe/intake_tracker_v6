// Tests for AuditLogTable — the event label + tint, record cell, actor resolution (name / System /
// unknown), and the payload disclosure (empty → em-dash, non-empty → expandable pre). jest-axe on the
// rendered table (with a details disclosure both collapsed and expanded).

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AuditLogRowDto, RecordId, UserId, WorkspaceId } from '@shared/types';

import { AuditLogTable } from './AuditLogTable';

function buildRow(overrides: Partial<AuditLogRowDto> = {}): AuditLogRowDto {
  return {
    auditId: '00000000-0000-0000-0000-0000000000e1',
    workspaceId: 'ws-1' as WorkspaceId,
    recordId: 'AIS-00000001' as RecordId,
    objectType: 'Request',
    eventType: 'request.updated',
    actorUserId: '00000000-0000-0000-0000-0000000000a1' as UserId,
    actorName: 'Ada Analyst',
    eventAt: '2026-07-02T10:00:00Z',
    payload: '{"field":"name","old":"A","new":"B"}',
    ...overrides,
  };
}

it('AuditLogTable — renders the event label, record, and actor', () => {
  // Arrange
  render(<AuditLogTable rows={[buildRow()]} />);

  // Assert
  expect(screen.getByText('Request updated')).toBeInTheDocument();
  expect(screen.getByText('AIS-00000001')).toBeInTheDocument();
  expect(screen.getByText('Ada Analyst')).toBeInTheDocument();
});

it('AuditLogTable — null actor renders "System"', () => {
  // Arrange
  render(<AuditLogTable rows={[buildRow({ actorUserId: null, actorName: null })]} />);

  // Assert
  expect(screen.getByText('System')).toBeInTheDocument();
});

it('AuditLogTable — known actor id but missing name renders "Unknown user"', () => {
  // Arrange
  render(<AuditLogTable rows={[buildRow({ actorName: null })]} />);

  // Assert
  expect(screen.getByText('Unknown user')).toBeInTheDocument();
});

it('AuditLogTable — empty payload shows an em-dash, no disclosure', () => {
  // Arrange
  render(<AuditLogTable rows={[buildRow({ payload: '{}' })]} />);

  // Assert — no disclosure summary (the "Details" column header is separate).
  expect(screen.queryByText('Details', { selector: 'summary' })).not.toBeInTheDocument();
});

it('AuditLogTable — non-empty payload exposes an expandable disclosure', async () => {
  // Arrange
  const user = userEvent.setup();
  const { container } = render(<AuditLogTable rows={[buildRow()]} />);

  // Assert — collapsed (scope to the summary, not the column header)
  const summary = screen.getByText('Details', { selector: 'summary' });
  expect(await axe(container)).toHaveNoViolations();

  // Act — expand
  await user.click(summary);

  // Assert — expanded shows the pretty JSON, still no a11y violations
  expect(screen.getByText(/"field": "name"/)).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});
