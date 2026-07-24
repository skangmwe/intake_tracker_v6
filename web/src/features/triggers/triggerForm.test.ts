// Unit tests for the pure form <-> request mapping. Covers the create/edit round-trip and the two
// normalisation rules (drop the interval unless the cadence repeats; null the value on set/not-set
// comparators and on an empty value-carrying comparator).

import {
  buildInitialForm,
  comparatorTakesValue,
  emptyCondition,
  formToRequest,
  isTodayValue,
} from './triggerForm';
import type { TriggerDto } from './types';

function buildTrigger(overrides: Partial<TriggerDto> = {}): TriggerDto {
  return {
    triggerId: 't-1',
    objectType: 'Request',
    kind: 'Authored',
    name: 'SLA breach',
    isEnabled: true,
    cadence: 'RepeatEveryNDays',
    repeatIntervalDays: 2,
    windowDays: null,
    notificationCategory: 'sla-reminder',
    recipients: ['assignedAnalyst'],
    notificationTitle: 'Request nearing SLA',
    notificationBody: 'Please review.',
    conditions: [{ whenFieldKey: 'dueDate', comparator: 'lt', compareValue: '@today' }],
    ...overrides,
  };
}

describe('triggerForm', () => {
  it('buildInitialForm — no trigger — returns a blank opt-in-disabled draft with one condition', () => {
    // Act
    const form = buildInitialForm(null, 'severity');

    // Assert
    expect(form.name).toBe('');
    expect(form.isEnabled).toBe(false);
    expect(form.cadence).toBe('Once');
    expect(form.recipients).toEqual([]);
    expect(form.conditions).toHaveLength(1);
    expect(form.conditions[0]?.whenFieldKey).toBe('severity');
  });

  it('buildInitialForm — existing trigger — mirrors its values', () => {
    // Act
    const form = buildInitialForm(buildTrigger(), 'severity');

    // Assert
    expect(form.name).toBe('SLA breach');
    expect(form.isEnabled).toBe(true);
    expect(form.repeatIntervalDays).toBe(2);
    expect(form.conditions[0]).toMatchObject({
      whenFieldKey: 'dueDate',
      comparator: 'lt',
      compareValue: '@today',
    });
  });

  it('buildInitialForm — null compareValue — becomes an empty string in the form', () => {
    // Arrange
    const trigger = buildTrigger({
      conditions: [{ whenFieldKey: 'stage', comparator: 'isSet', compareValue: null }],
    });

    // Act
    const form = buildInitialForm(trigger, 'severity');

    // Assert
    expect(form.conditions[0]?.compareValue).toBe('');
  });

  it('formToRequest — Once cadence — drops the repeat interval', () => {
    // Arrange
    const form = buildInitialForm(buildTrigger({ cadence: 'Once', repeatIntervalDays: 5 }), 's');

    // Act
    const request = formToRequest(form);

    // Assert
    expect(request.repeatIntervalDays).toBeNull();
  });

  it('formToRequest — repeat cadence — keeps the interval', () => {
    // Arrange
    const form = buildInitialForm(buildTrigger(), 's');

    // Act
    const request = formToRequest(form);

    // Assert
    expect(request.repeatIntervalDays).toBe(2);
  });

  it('formToRequest — set/not-set comparator — nulls the value', () => {
    // Arrange
    const form = buildInitialForm(
      buildTrigger({
        conditions: [{ whenFieldKey: 'stage', comparator: 'isSet', compareValue: 'ignored' }],
      }),
      's',
    );

    // Act
    const request = formToRequest(form);

    // Assert
    expect(request.conditions[0]?.compareValue).toBeNull();
  });

  it('formToRequest — value-carrying comparator with a blank value — nulls it', () => {
    // Arrange
    const form = buildInitialForm(
      buildTrigger({
        conditions: [{ whenFieldKey: 'stage', comparator: 'eq', compareValue: '   ' }],
      }),
      's',
    );

    // Act
    const request = formToRequest(form);

    // Assert
    expect(request.conditions[0]?.compareValue).toBeNull();
  });

  it('formToRequest — trims the name, title, and body', () => {
    // Arrange
    const form = buildInitialForm(
      buildTrigger({ name: '  Trim  ', notificationTitle: '  Title  ', notificationBody: '  B  ' }),
      's',
    );

    // Act
    const request = formToRequest(form);

    // Assert
    expect(request.name).toBe('Trim');
    expect(request.notificationTitle).toBe('Title');
    expect(request.notificationBody).toBe('B');
  });

  it('comparatorTakesValue — set/not-set are valueless, others take a value', () => {
    expect(comparatorTakesValue('isSet')).toBe(false);
    expect(comparatorTakesValue('isNotSet')).toBe(false);
    expect(comparatorTakesValue('eq')).toBe(true);
  });

  it('isTodayValue — matches only the @today token', () => {
    expect(isTodayValue('@today')).toBe(true);
    expect(isTodayValue('2026-01-01')).toBe(false);
  });

  it('emptyCondition — seeds the default field key and an eq comparator', () => {
    // Act
    const row = emptyCondition('dueDate');

    // Assert
    expect(row.whenFieldKey).toBe('dueDate');
    expect(row.comparator).toBe('eq');
    expect(row.compareValue).toBe('');
    expect(row.id).toEqual(expect.any(String));
  });
});
