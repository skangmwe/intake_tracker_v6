// Unit tests for computeActiveAlerts (S4 Active-alerts feed composition, record-detail reconciliation).

import { buildApprovalRequest, buildRequestDto } from '@/test-utils';

import { computeActiveAlerts } from './activeAlertsModel';

describe('computeActiveAlerts', () => {
  it('computeActiveAlerts — on-track, in progress, no gates — no alerts', () => {
    // Arrange
    const request = buildRequestDto({ slaStatus: 'OnTrack', statusHold: 'InProgress' });

    // Act / Assert
    expect(computeActiveAlerts(request, [])).toEqual([]);
  });

  it('computeActiveAlerts — overdue — a past-due alert', () => {
    // Arrange
    const request = buildRequestDto({ slaStatus: 'Overdue' });

    // Act
    const alerts = computeActiveAlerts(request, []);

    // Assert
    expect(alerts).toEqual([{ id: 'sla-overdue', tone: 'error', iconKey: 'overdue', title: 'Past the due date' }]);
  });

  it('computeActiveAlerts — due soon — a warning-tone alert', () => {
    // Arrange / Act
    const alerts = computeActiveAlerts(buildRequestDto({ slaStatus: 'DueSoon' }), []);

    // Assert
    expect(alerts[0]).toMatchObject({ tone: 'warning', iconKey: 'dueSoon', title: 'Due soon' });
  });

  it('computeActiveAlerts — on hold with a note — hold alert carries the reason', () => {
    // Arrange
    const request = buildRequestDto({ statusHold: 'OnHold', statusHoldNote: 'Waiting on client' });

    // Act
    const alerts = computeActiveAlerts(request, []);

    // Assert
    expect(alerts).toEqual([
      { id: 'hold', tone: 'warning', iconKey: 'hold', title: 'On hold', note: 'Waiting on client' },
    ]);
  });

  it('computeActiveAlerts — abandoned without a note — no note field (exactOptional-safe)', () => {
    // Arrange — no note supplied.
    const request = buildRequestDto({ statusHold: 'Abandoned', statusHoldNote: null });

    // Act
    const alerts = computeActiveAlerts(request, []);

    // Assert — the alert is present and carries no `note` key.
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ id: 'abandoned', tone: 'error', title: 'Abandoned' });
    expect(alerts[0]).not.toHaveProperty('note');
  });

  it('computeActiveAlerts — a pending gate — an awaiting-sign-off alert', () => {
    // Arrange
    const gate = buildApprovalRequest({ state: 'Pending', gateName: 'Validation readiness gate' });

    // Act
    const alerts = computeActiveAlerts(buildRequestDto(), [gate]);

    // Assert
    expect(alerts[0]).toMatchObject({
      iconKey: 'gateOpen',
      tone: 'warning',
      title: 'Validation readiness gate awaiting sign-off',
    });
  });

  it('computeActiveAlerts — a changes-requested gate — a blocked alert; resolved gates are skipped', () => {
    // Arrange
    const blocked = buildApprovalRequest({ id: 'g-blocked' as ReturnType<typeof buildApprovalRequest>['id'], state: 'ChangesRequested', gateName: 'Delivery gate' });
    const resolved = buildApprovalRequest({ id: 'g-resolved' as ReturnType<typeof buildApprovalRequest>['id'], state: 'Resolved', gateName: 'Old gate' });

    // Act
    const alerts = computeActiveAlerts(buildRequestDto(), [blocked, resolved]);

    // Assert — only the blocked gate produces an alert.
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ tone: 'error', iconKey: 'gateBlocked', title: 'Delivery gate — changes requested' });
  });

  it('computeActiveAlerts — SLA + hold + gate — composed in order', () => {
    // Arrange
    const request = buildRequestDto({ slaStatus: 'Overdue', statusHold: 'OnHold', statusHoldNote: 'Paused' });
    const gate = buildApprovalRequest({ state: 'Pending', gateName: 'Gate' });

    // Act
    const alerts = computeActiveAlerts(request, [gate]);

    // Assert — order: SLA, hold, gate.
    expect(alerts.map((alert) => alert.iconKey)).toEqual(['overdue', 'hold', 'gateOpen']);
  });

  it('computeActiveAlerts — undefined gates — treated as none', () => {
    expect(computeActiveAlerts(buildRequestDto({ slaStatus: 'Overdue' }), undefined)).toHaveLength(1);
  });
});
