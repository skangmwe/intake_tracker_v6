// Unit tests for the pure lifecycle draft model + reducer (web-testing.md — logic-only, no DOM).
// Index access uses `!` on known-populated fixtures (the project's test convention, matching
// fieldForm.test.ts) — noUncheckedIndexedAccess is on.

import { buildLifecycleConfig } from '@/test-utils';

import {
  draftFromConfig,
  draftToRequest,
  lifecycleDraftReducer,
  newGate,
  newLifecycle,
  newSlot,
  newStage,
  type LifecycleDraft,
} from './lifecycleDraft';

function seed(): LifecycleDraft[] {
  return draftFromConfig(buildLifecycleConfig());
}

describe('draftFromConfig / draftToRequest', () => {
  it('draftFromConfig — maps stages and resolves gate stage ids to keys', () => {
    // Arrange + Act
    const drafts = draftFromConfig(buildLifecycleConfig());

    // Assert
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.stages.map((stage) => stage.key)).toEqual(['build', 'qa']);
    expect(drafts[0]!.gates[0]!.fromStageKey).toBe('build');
    expect(drafts[0]!.gates[0]!.toStageKey).toBe('qa');
    expect(drafts[0]!.gates[0]!.slots[0]!.roleLabel).toBe('InfoSec');
  });

  it('draftToRequest — derives sortOrder from position and preserves ids', () => {
    // Arrange
    const drafts = seed();

    // Act
    const request = draftToRequest(drafts);

    // Assert
    expect(request.lifecycles[0]!.sortOrder).toBe(0);
    expect(request.lifecycles[0]!.isDefault).toBe(true);
    expect(request.lifecycles[0]!.stages[1]!.sortOrder).toBe(1);
    expect(request.lifecycles[0]!.gates[0]!.fromStageKey).toBe('build');
    expect(request.lifecycles[0]!.gates[0]!.slots).toEqual([{ roleLabel: 'InfoSec' }]);
  });

  it('draftToRequest — omits id for a new lifecycle', () => {
    const request = draftToRequest([newLifecycle()]);
    expect(request.lifecycles[0]).not.toHaveProperty('id');
  });

  it('draftToRequest — mirrors requestType from the lifecycle name (v2: the name is the single label)', () => {
    // Arrange — rename the seeded lifecycle; the dropped "Request type" now tracks the name.
    const drafts = seed();
    const next = lifecycleDraftReducer(drafts, { type: 'LIFECYCLE_UPDATE', uid: drafts[0]!.uid, patch: { name: 'Renamed flow' } });

    // Act
    const request = draftToRequest(next);

    // Assert — the server's NOT NULL RequestType column stays populated, mirroring the label.
    expect(request.lifecycles[0]!.name).toBe('Renamed flow');
    expect(request.lifecycles[0]!.requestType).toBe('Renamed flow');
  });

  it('draftToRequest — omits id for newly added stages and gates but keeps seeded ids', () => {
    // Arrange — add a fresh (id-less) stage and gate to a seeded lifecycle
    const state = seed();
    const withStage = lifecycleDraftReducer(state, { type: 'STAGE_ADD', lifecycleUid: state[0]!.uid });
    const withGate = lifecycleDraftReducer(withStage, { type: 'GATE_ADD', lifecycleUid: state[0]!.uid });

    // Act
    const lifecycle = draftToRequest(withGate).lifecycles[0]!;

    // Assert
    expect(lifecycle.stages[0]).toHaveProperty('id'); // seeded stage keeps its id
    expect(lifecycle.stages.at(-1)).not.toHaveProperty('id'); // the new stage omits id
    expect(lifecycle.gates.at(-1)).not.toHaveProperty('id'); // the new gate omits id
  });
});

describe('factory helpers', () => {
  it('newStage — starts as a Build-category stage with matching uid/key', () => {
    const stage = newStage();
    expect(stage.statusCategory).toBe('Build');
    expect(stage.uid).toBe(stage.key);
  });

  it('newGate — points from and to the provided stage key', () => {
    const gate = newGate('build');
    expect(gate.fromStageKey).toBe('build');
    expect(gate.toStageKey).toBe('build');
    expect(gate.slots).toEqual([]);
  });

  it('newSlot / newLifecycle — carry the expected defaults', () => {
    expect(newSlot('GCO').roleLabel).toBe('GCO');
    const lifecycle = newLifecycle();
    expect(lifecycle.isDefault).toBe(false);
    expect(lifecycle.stages).toEqual([]);
  });
});

describe('lifecycleDraftReducer', () => {
  it('REPLACE — swaps the whole draft', () => {
    const next = lifecycleDraftReducer([], { type: 'REPLACE', drafts: seed() });
    expect(next).toHaveLength(1);
  });

  it('LIFECYCLE_ADD — appends the supplied lifecycle', () => {
    const added = newLifecycle();
    const next = lifecycleDraftReducer(seed(), { type: 'LIFECYCLE_ADD', lifecycle: added });
    expect(next.at(-1)).toBe(added);
  });

  it('LIFECYCLE_UPDATE — patches the name (the single label)', () => {
    const state = seed();
    const next = lifecycleDraftReducer(state, { type: 'LIFECYCLE_UPDATE', uid: state[0]!.uid, patch: { name: 'Renamed' } });
    expect(next[0]!.name).toBe('Renamed');
  });

  it('LIFECYCLE_SET_DEFAULT — moves the default flag exclusively', () => {
    const state = lifecycleDraftReducer(seed(), { type: 'LIFECYCLE_ADD', lifecycle: newLifecycle() });
    const next = lifecycleDraftReducer(state, { type: 'LIFECYCLE_SET_DEFAULT', uid: state[1]!.uid });
    expect(next[0]!.isDefault).toBe(false);
    expect(next[1]!.isDefault).toBe(true);
  });

  it('LIFECYCLE_REMOVE — refuses to remove the last lifecycle', () => {
    const state = seed();
    const next = lifecycleDraftReducer(state, { type: 'LIFECYCLE_REMOVE', uid: state[0]!.uid });
    expect(next).toHaveLength(1);
  });

  it('LIFECYCLE_REMOVE — reassigns the default when the default is removed', () => {
    const withSecond = lifecycleDraftReducer(seed(), { type: 'LIFECYCLE_ADD', lifecycle: newLifecycle() });
    const defaultUid = withSecond[0]!.uid;
    const next = lifecycleDraftReducer(withSecond, { type: 'LIFECYCLE_REMOVE', uid: defaultUid });
    expect(next).toHaveLength(1);
    expect(next[0]!.isDefault).toBe(true);
  });

  it('STAGE_ADD / STAGE_UPDATE — add and edit a stage', () => {
    const state = seed();
    const added = lifecycleDraftReducer(state, { type: 'STAGE_ADD', lifecycleUid: state[0]!.uid });
    expect(added[0]!.stages).toHaveLength(3);
    const stageUid = added[0]!.stages[2]!.uid;
    const updated = lifecycleDraftReducer(added, {
      type: 'STAGE_UPDATE',
      lifecycleUid: state[0]!.uid,
      stageUid,
      patch: { label: 'Discovery', statusCategory: 'Intake' },
    });
    expect(updated[0]!.stages[2]!.label).toBe('Discovery');
    expect(updated[0]!.stages[2]!.statusCategory).toBe('Intake');
  });

  it('STAGE_REMOVE — repoints gates that referenced the removed stage', () => {
    const state = seed();
    // Remove the "qa" stage that the gate points to; the gate should fall back to the remaining stage.
    const qaStageUid = state[0]!.stages[1]!.uid;
    const next = lifecycleDraftReducer(state, { type: 'STAGE_REMOVE', lifecycleUid: state[0]!.uid, stageUid: qaStageUid });
    expect(next[0]!.stages).toHaveLength(1);
    expect(next[0]!.gates[0]!.toStageKey).toBe('build');
  });

  it('STAGE_REMOVE — leaves stages and gates untouched when the stage uid is unknown', () => {
    const state = seed();
    const next = lifecycleDraftReducer(state, { type: 'STAGE_REMOVE', lifecycleUid: state[0]!.uid, stageUid: 'no-such-uid' });
    expect(next[0]!.stages).toHaveLength(2);
    expect(next[0]!.gates[0]!.toStageKey).toBe('qa'); // gate keys unchanged (nothing was removed)
  });

  it('LIFECYCLE_REMOVE — removing a non-default lifecycle leaves the default in place', () => {
    const withSecond = lifecycleDraftReducer(seed(), { type: 'LIFECYCLE_ADD', lifecycle: newLifecycle() });
    const nonDefaultUid = withSecond[1]!.uid;
    const next = lifecycleDraftReducer(withSecond, { type: 'LIFECYCLE_REMOVE', uid: nonDefaultUid });
    expect(next).toHaveLength(1);
    expect(next[0]!.isDefault).toBe(true);
  });

  it('GATE_ADD / GATE_UPDATE / GATE_REMOVE — manage gates', () => {
    const state = seed();
    const added = lifecycleDraftReducer(state, { type: 'GATE_ADD', lifecycleUid: state[0]!.uid });
    expect(added[0]!.gates).toHaveLength(2);
    const gateUid = added[0]!.gates[1]!.uid;
    const renamed = lifecycleDraftReducer(added, {
      type: 'GATE_UPDATE',
      lifecycleUid: state[0]!.uid,
      gateUid,
      patch: { name: 'Launch gate', toStageKey: 'qa' },
    });
    expect(renamed[0]!.gates[1]!.name).toBe('Launch gate');
    const removed = lifecycleDraftReducer(renamed, { type: 'GATE_REMOVE', lifecycleUid: state[0]!.uid, gateUid });
    expect(removed[0]!.gates).toHaveLength(1);
  });

  it('SLOT_ADD / SLOT_UPDATE / SLOT_REMOVE — manage a gate\'s approver slots', () => {
    const state = seed();
    const gateUid = state[0]!.gates[0]!.uid;
    const added = lifecycleDraftReducer(state, { type: 'SLOT_ADD', lifecycleUid: state[0]!.uid, gateUid, roleLabel: 'GCO' });
    expect(added[0]!.gates[0]!.slots).toHaveLength(2);
    const slotUid = added[0]!.gates[0]!.slots[1]!.uid;
    const updated = lifecycleDraftReducer(added, {
      type: 'SLOT_UPDATE',
      lifecycleUid: state[0]!.uid,
      gateUid,
      slotUid,
      roleLabel: 'AI Solutions Manager',
    });
    expect(updated[0]!.gates[0]!.slots[1]!.roleLabel).toBe('AI Solutions Manager');
    const removed = lifecycleDraftReducer(updated, { type: 'SLOT_REMOVE', lifecycleUid: state[0]!.uid, gateUid, slotUid });
    expect(removed[0]!.gates[0]!.slots).toHaveLength(1);
  });
});
