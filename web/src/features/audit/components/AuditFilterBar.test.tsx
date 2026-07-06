// Tests for AuditFilterBar — the draft state applies on submit (not per keystroke), Clear calls back,
// and toAuditQuery drops empty filters. jest-axe on the default render (the only meaningful state — a
// controlled form with no conditional branches). userEvent over fireEvent (web-testing.md).

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { UserId } from '@shared/types';

import {
  AuditFilterBar,
  EMPTY_AUDIT_FILTERS,
  toAuditQuery,
  type AuditFilterValues,
} from './AuditFilterBar';

const ACTOR_OPTIONS = [{ value: '00000000-0000-0000-0000-0000000000a1', label: 'Ada Analyst' }];

function setup(overrides: Partial<Parameters<typeof AuditFilterBar>[0]> = {}) {
  const onApply = jest.fn();
  const onClear = jest.fn();
  const view = render(
    <AuditFilterBar
      value={EMPTY_AUDIT_FILTERS}
      actorOptions={ACTOR_OPTIONS}
      onApply={onApply}
      onClear={onClear}
      {...overrides}
    />,
  );
  return { onApply, onClear, ...view };
}

it('AuditFilterBar — default render — has no axe violations', async () => {
  // Arrange
  const { container } = setup();

  // Assert
  expect(await axe(container)).toHaveNoViolations();
});

it('AuditFilterBar — apply — submits the draft filters', async () => {
  // Arrange
  const user = userEvent.setup();
  const { onApply } = setup();

  // Act
  await user.type(screen.getByLabelText(/record id/i), 'AIS-00000042');
  await user.selectOptions(screen.getByLabelText(/event type/i), 'gate.resolved');
  await user.click(screen.getByRole('button', { name: /apply filters/i }));

  // Assert
  expect(onApply).toHaveBeenCalledTimes(1);
  expect(onApply).toHaveBeenCalledWith(
    expect.objectContaining({ recordId: 'AIS-00000042', eventType: 'gate.resolved' }),
  );
});

it('AuditFilterBar — date range + actor flow through on apply', async () => {
  // Arrange
  const user = userEvent.setup();
  const { onApply } = setup();

  // Act — set both dates and pick the one actor, then apply. (Labels carry a "(optional)" suffix,
  // and "Actor" contains "to", so anchor the "To" matcher.)
  await user.type(screen.getByLabelText(/from/i), '2026-07-01');
  await user.type(screen.getByLabelText(/^to/i), '2026-07-31');
  await user.selectOptions(screen.getByLabelText(/actor/i), '00000000-0000-0000-0000-0000000000a1');
  await user.click(screen.getByRole('button', { name: /apply filters/i }));

  // Assert
  expect(onApply).toHaveBeenCalledWith(
    expect.objectContaining({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
      actorUserId: '00000000-0000-0000-0000-0000000000a1',
    }),
  );
});

it('AuditFilterBar — clear — calls onClear', async () => {
  // Arrange
  const user = userEvent.setup();
  const { onClear } = setup();

  // Act
  await user.click(screen.getByRole('button', { name: /clear filters/i }));

  // Assert
  expect(onClear).toHaveBeenCalledTimes(1);
});

it('AuditFilterBar — apply does not fire on record-id keystrokes (only on submit)', async () => {
  // Arrange
  const user = userEvent.setup();
  const { onApply } = setup();

  // Act — typing alone must not trigger a query.
  await user.type(screen.getByLabelText(/record id/i), 'AIS');

  // Assert
  expect(onApply).not.toHaveBeenCalled();
});

it('toAuditQuery — drops empty filters and keeps set ones', () => {
  // Arrange
  const values: AuditFilterValues = {
    dateFrom: '2026-07-01',
    dateTo: '',
    actorUserId: '00000000-0000-0000-0000-0000000000a1',
    recordId: '  ',
    eventType: '',
  };

  // Act
  const query = toAuditQuery(values);

  // Assert — only the two non-empty filters survive (blank recordId is trimmed away).
  expect(query).toEqual({
    dateFrom: '2026-07-01',
    actorUserId: '00000000-0000-0000-0000-0000000000a1' as UserId,
  });
});
