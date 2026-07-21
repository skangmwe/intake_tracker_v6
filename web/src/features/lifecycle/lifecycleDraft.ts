// The editable draft model for the S31 Lifecycle & gates surface, plus the pure reducer that
// mutates it. Kept free of React so it is unit-testable in isolation (web-testing.md). The draft
// carries a stable client `uid` per item for React keys; server ids are preserved so the reconcile
// updates in place. A stage's machine `key` is stable across label edits so gates keep pointing at
// the right stage when it is renamed.

import type {
  GateDefinitionId,
  LifecycleConfigDto,
  LifecycleConfigUpdateRequest,
  LifecycleDto,
  LifecycleId,
  StageDefinitionId,
  StatusCategory,
} from '@shared/types';

export interface SlotDraft {
  uid: string;
  roleLabel: string;
}

export interface GateDraft {
  uid: string;
  id?: GateDefinitionId;
  name: string;
  /** Stage machine keys within this lifecycle. */
  fromStageKey: string;
  toStageKey: string;
  slots: SlotDraft[];
}

export interface StageDraft {
  uid: string;
  id?: StageDefinitionId;
  /** Machine key — stable across label renames; gates reference it. */
  key: string;
  label: string;
  statusCategory: StatusCategory;
}

export interface LifecycleDraft {
  uid: string;
  id?: LifecycleId;
  /** v2 (slice 27): the single user-facing label — the separate "Request type" was dropped. */
  name: string;
  isDefault: boolean;
  stages: StageDraft[];
  gates: GateDraft[];
}

export const STATUS_CATEGORIES: readonly StatusCategory[] = [
  'Intake',
  'Triage',
  'Execution',
  'Validation',
  'Delivery',
  'Stabilization',
  'Closure',
];

const uid = (): string => crypto.randomUUID();

export function newStage(): StageDraft {
  const id = uid();
  return { uid: id, key: id, label: 'New stage', statusCategory: 'Execution' };
}

export function newGate(firstStageKey: string): GateDraft {
  return { uid: uid(), name: 'New gate', fromStageKey: firstStageKey, toStageKey: firstStageKey, slots: [] };
}

export function newSlot(roleLabel: string): SlotDraft {
  return { uid: uid(), roleLabel };
}

export function newLifecycle(): LifecycleDraft {
  return { uid: uid(), name: 'New lifecycle', isDefault: false, stages: [], gates: [] };
}

/** Seed the editable draft from the server config. */
export function draftFromConfig(config: LifecycleConfigDto): LifecycleDraft[] {
  return config.lifecycles.map((lifecycle: LifecycleDto) => {
    const keyByStageId = new Map(lifecycle.stages.map((stage) => [stage.id, stage.key]));
    return {
      uid: lifecycle.id,
      id: lifecycle.id,
      name: lifecycle.name,
      isDefault: lifecycle.isDefault,
      stages: lifecycle.stages.map((stage) => ({
        uid: stage.id,
        id: stage.id,
        key: stage.key,
        label: stage.label,
        statusCategory: stage.statusCategory,
      })),
      gates: lifecycle.gates.map((gate) => ({
        uid: gate.id,
        id: gate.id,
        name: gate.name,
        fromStageKey: keyByStageId.get(gate.fromStageId) ?? '',
        toStageKey: keyByStageId.get(gate.toStageId) ?? '',
        slots: gate.slots.map((slot) => ({ uid: uid(), roleLabel: slot.roleLabel })),
      })),
    };
  });
}

/** Serialize the draft into the PATCH body (sortOrder derives from array position). A new item omits
 *  `id` entirely (never `id: undefined`, which exactOptionalPropertyTypes rejects) so the server mints one. */
export function draftToRequest(drafts: LifecycleDraft[]): LifecycleConfigUpdateRequest {
  return {
    lifecycles: drafts.map((lifecycle, lifecycleIndex) => ({
      ...(lifecycle.id ? { id: lifecycle.id } : {}),
      name: lifecycle.name,
      // v2 (slice 27): the lifecycle name is the single label — the separate "Request type" was
      // dropped from the UI. We mirror requestType from the name so the server's NOT NULL column
      // stays populated (and legacy CSV-import request-type matching keeps resolving by the label).
      requestType: lifecycle.name,
      isDefault: lifecycle.isDefault,
      sortOrder: lifecycleIndex,
      stages: lifecycle.stages.map((stage, stageIndex) => ({
        ...(stage.id ? { id: stage.id } : {}),
        key: stage.key,
        label: stage.label,
        statusCategory: stage.statusCategory,
        sortOrder: stageIndex,
      })),
      gates: lifecycle.gates.map((gate, gateIndex) => ({
        ...(gate.id ? { id: gate.id } : {}),
        name: gate.name,
        fromStageKey: gate.fromStageKey,
        toStageKey: gate.toStageKey,
        sortOrder: gateIndex,
        slots: gate.slots.map((slot) => ({ roleLabel: slot.roleLabel })),
      })),
    })),
  };
}

export type LifecycleDraftAction =
  | { type: 'REPLACE'; drafts: LifecycleDraft[] }
  | { type: 'LIFECYCLE_ADD'; lifecycle: LifecycleDraft }
  | { type: 'LIFECYCLE_UPDATE'; uid: string; patch: Partial<Pick<LifecycleDraft, 'name'>> }
  | { type: 'LIFECYCLE_REMOVE'; uid: string }
  | { type: 'LIFECYCLE_SET_DEFAULT'; uid: string }
  | { type: 'STAGE_ADD'; lifecycleUid: string }
  | { type: 'STAGE_UPDATE'; lifecycleUid: string; stageUid: string; patch: Partial<Pick<StageDraft, 'label' | 'statusCategory'>> }
  | { type: 'STAGE_REMOVE'; lifecycleUid: string; stageUid: string }
  | { type: 'GATE_ADD'; lifecycleUid: string }
  | { type: 'GATE_UPDATE'; lifecycleUid: string; gateUid: string; patch: Partial<Pick<GateDraft, 'name' | 'fromStageKey' | 'toStageKey'>> }
  | { type: 'GATE_REMOVE'; lifecycleUid: string; gateUid: string }
  | { type: 'SLOT_ADD'; lifecycleUid: string; gateUid: string; roleLabel: string }
  | { type: 'SLOT_UPDATE'; lifecycleUid: string; gateUid: string; slotUid: string; roleLabel: string }
  | { type: 'SLOT_REMOVE'; lifecycleUid: string; gateUid: string; slotUid: string };

function mapLifecycle(
  list: LifecycleDraft[],
  targetUid: string,
  update: (lifecycle: LifecycleDraft) => LifecycleDraft,
): LifecycleDraft[] {
  return list.map((lifecycle) => (lifecycle.uid === targetUid ? update(lifecycle) : lifecycle));
}

function mapGate(lifecycle: LifecycleDraft, gateUid: string, update: (gate: GateDraft) => GateDraft): LifecycleDraft {
  return { ...lifecycle, gates: lifecycle.gates.map((gate) => (gate.uid === gateUid ? update(gate) : gate)) };
}

export function lifecycleDraftReducer(state: LifecycleDraft[], action: LifecycleDraftAction): LifecycleDraft[] {
  switch (action.type) {
    case 'REPLACE':
      return action.drafts;

    case 'LIFECYCLE_ADD':
      return [...state, action.lifecycle];

    case 'LIFECYCLE_UPDATE':
      return mapLifecycle(state, action.uid, (lifecycle) => ({ ...lifecycle, ...action.patch }));

    case 'LIFECYCLE_REMOVE': {
      if (state.length <= 1) return state;
      const removed = state.find((lifecycle) => lifecycle.uid === action.uid);
      const remaining = state.filter((lifecycle) => lifecycle.uid !== action.uid);
      // Keep exactly one default.
      const head = remaining[0];
      if (removed?.isDefault && head && !remaining.some((lifecycle) => lifecycle.isDefault)) {
        remaining[0] = { ...head, isDefault: true };
      }
      return remaining;
    }

    case 'LIFECYCLE_SET_DEFAULT':
      return state.map((lifecycle) => ({ ...lifecycle, isDefault: lifecycle.uid === action.uid }));

    case 'STAGE_ADD':
      return mapLifecycle(state, action.lifecycleUid, (lifecycle) => ({ ...lifecycle, stages: [...lifecycle.stages, newStage()] }));

    case 'STAGE_UPDATE':
      return mapLifecycle(state, action.lifecycleUid, (lifecycle) => ({
        ...lifecycle,
        stages: lifecycle.stages.map((stage) => (stage.uid === action.stageUid ? { ...stage, ...action.patch } : stage)),
      }));

    case 'STAGE_REMOVE':
      return mapLifecycle(state, action.lifecycleUid, (lifecycle) => {
        const removed = lifecycle.stages.find((stage) => stage.uid === action.stageUid);
        const stages = lifecycle.stages.filter((stage) => stage.uid !== action.stageUid);
        const fallbackKey = stages[0]?.key ?? '';
        // Repoint any gate that referenced the removed stage so the config stays valid.
        const gates = removed
          ? lifecycle.gates.map((gate) => ({
              ...gate,
              fromStageKey: gate.fromStageKey === removed.key ? fallbackKey : gate.fromStageKey,
              toStageKey: gate.toStageKey === removed.key ? fallbackKey : gate.toStageKey,
            }))
          : lifecycle.gates;
        return { ...lifecycle, stages, gates };
      });

    case 'GATE_ADD':
      return mapLifecycle(state, action.lifecycleUid, (lifecycle) => ({
        ...lifecycle,
        gates: [...lifecycle.gates, newGate(lifecycle.stages[0]?.key ?? '')],
      }));

    case 'GATE_UPDATE':
      return mapLifecycle(state, action.lifecycleUid, (lifecycle) =>
        mapGate(lifecycle, action.gateUid, (gate) => ({ ...gate, ...action.patch })),
      );

    case 'GATE_REMOVE':
      return mapLifecycle(state, action.lifecycleUid, (lifecycle) => ({
        ...lifecycle,
        gates: lifecycle.gates.filter((gate) => gate.uid !== action.gateUid),
      }));

    case 'SLOT_ADD':
      return mapLifecycle(state, action.lifecycleUid, (lifecycle) =>
        mapGate(lifecycle, action.gateUid, (gate) => ({ ...gate, slots: [...gate.slots, newSlot(action.roleLabel)] })),
      );

    case 'SLOT_UPDATE':
      return mapLifecycle(state, action.lifecycleUid, (lifecycle) =>
        mapGate(lifecycle, action.gateUid, (gate) => ({
          ...gate,
          slots: gate.slots.map((slot) => (slot.uid === action.slotUid ? { ...slot, roleLabel: action.roleLabel } : slot)),
        })),
      );

    case 'SLOT_REMOVE':
      return mapLifecycle(state, action.lifecycleUid, (lifecycle) =>
        mapGate(lifecycle, action.gateUid, (gate) => ({ ...gate, slots: gate.slots.filter((slot) => slot.uid !== action.slotUid) })),
      );
  }

  // Unreachable when the action union is exhaustive (web-state-management.md).
  return state;
}
