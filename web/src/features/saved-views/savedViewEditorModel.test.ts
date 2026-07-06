// Unit tests for the saved-view editor model (S24) — the pure draft ↔ wire mapping.

import type { SavedViewDto, SavedViewId, UserId, WorkspaceId } from '@shared/types';

import {
  draftFromView,
  draftToUpsertRequest,
  emptyDraft,
  filterRowToClause,
  isDraftValid,
  type FilterRow,
} from './savedViewEditorModel';

function buildView(overrides: Partial<SavedViewDto> = {}): SavedViewDto {
  return {
    id: 'sv-1' as SavedViewId,
    workspaceId: 'ws-1' as WorkspaceId,
    objectType: 'Request',
    name: 'My open work',
    scope: 'personal',
    isDefault: false,
    columns: ['name', 'stage'],
    filters: {
      stage: { kind: 'select', values: ['build', 'qa'] },
      name: { kind: 'text', contains: 'x' },
    },
    sort: [{ column: 'updatedAt', direction: 'desc' }],
    ownerUserId: '00000000-0000-0000-0000-0000000000aa' as UserId,
    createdBy: '00000000-0000-0000-0000-0000000000aa' as UserId,
    createdAt: '2026-07-05T10:00:00Z',
    updatedAt: '2026-07-05T10:00:00Z',
    ...overrides,
  };
}

describe('savedViewEditorModel', () => {
  it('emptyDraft — starts personal with the surface default columns and no rules', () => {
    // Act
    const draft = emptyDraft(['name', 'stage']);

    // Assert
    expect(draft).toMatchObject({
      name: '',
      scope: 'personal',
      isDefault: false,
      columns: ['name', 'stage'],
    });
    expect(draft.filters).toHaveLength(0);
    expect(draft.sort).toHaveLength(0);
  });

  it('draftFromView — maps a wire view into editable rows', () => {
    // Act
    const draft = draftFromView(buildView());

    // Assert — select → is, text → contains; sort carried through.
    expect(draft.name).toBe('My open work');
    expect(draft.columns).toEqual(['name', 'stage']);
    const stageRow = draft.filters.find((row) => row.column === 'stage');
    expect(stageRow).toMatchObject({ comparator: 'is', value: 'build, qa' });
    const nameRow = draft.filters.find((row) => row.column === 'name');
    expect(nameRow).toMatchObject({ comparator: 'contains', value: 'x' });
    expect(draft.sort[0]).toMatchObject({ column: 'updatedAt', direction: 'desc' });
  });

  it('filterRowToClause — number comparators map to typed clauses; incomplete rows drop', () => {
    // Arrange
    const numberRow: FilterRow = { id: 'r1', column: 'priority', comparator: 'gte', value: '5' };
    const blankRow: FilterRow = { id: 'r2', column: 'priority', comparator: 'gte', value: '' };
    const badNumber: FilterRow = { id: 'r3', column: 'priority', comparator: 'gte', value: 'abc' };

    // Assert
    expect(filterRowToClause(numberRow)).toEqual({ kind: 'number', op: '>=', value: 5 });
    expect(filterRowToClause(blankRow)).toBeNull();
    expect(filterRowToClause(badNumber)).toBeNull();
  });

  it('draftToUpsertRequest — serialises the draft and drops incomplete filter rows', () => {
    // Arrange
    const draft = draftFromView(buildView());
    draft.filters.push({ id: 'blank', column: 'analyst', comparator: 'contains', value: '' });

    // Act
    const request = draftToUpsertRequest(draft, 'Request');

    // Assert — the blank row is not serialised; objectType stamped.
    expect(request.objectType).toBe('Request');
    expect(request.filters).toHaveProperty('stage');
    expect(request.filters).not.toHaveProperty('analyst');
    expect(request.sort).toEqual([{ column: 'updatedAt', direction: 'desc' }]);
  });

  it('isDraftValid — requires a non-empty name', () => {
    expect(isDraftValid({ ...emptyDraft([]), name: '' })).toBe(false);
    expect(isDraftValid({ ...emptyDraft([]), name: '  ' })).toBe(false);
    expect(isDraftValid({ ...emptyDraft([]), name: 'Named' })).toBe(true);
  });
});
