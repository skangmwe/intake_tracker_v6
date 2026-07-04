// Section 2 of S31 — the lifecycle's approval gates. Each gate is a name + a from→to stage
// transition + a team-only approver-slot list. The eligible-member count per slot is live from the
// approver-teams roster (never stored). Presentational — mutations dispatch to the draft reducer.

import type { Dispatch } from 'react';
import { Plus, SealCheck, Trash, UsersThree, X } from '@phosphor-icons/react';

import { Button } from '@/shared/components/Button';
import { IconButton } from '@/shared/components/Button/IconButton';

import type { LifecycleDraft, LifecycleDraftAction } from '../lifecycleDraft';

interface GatesEditorProps {
  lifecycle: LifecycleDraft;
  roleLabels: string[];
  eligibleByRole: Map<string, number>;
  dispatch: Dispatch<LifecycleDraftAction>;
}

export function GatesEditor({ lifecycle, roleLabels, eligibleByRole, dispatch }: GatesEditorProps) {
  const stageOptions = lifecycle.stages;
  const firstRole = roleLabels[0] ?? '';

  return (
    <section className="lifecycle-card__section" aria-labelledby={`gates-${lifecycle.uid}`}>
      <div className="lifecycle-section-head">
        <span className="lifecycle-badge" id={`gates-${lifecycle.uid}`}>
          <span className="lifecycle-badge__num" aria-hidden>2</span>Gates
        </span>
        <Button variant="secondary" compact onClick={() => dispatch({ type: 'GATE_ADD', lifecycleUid: lifecycle.uid })}>
          <Plus size={16} aria-hidden /> Add gate
        </Button>
      </div>

      {lifecycle.gates.map((gate) => (
        <div className="lifecycle-gate" key={gate.uid}>
          <div className="lifecycle-gate__head">
            <SealCheck className="lifecycle-gate__icon" size={22} aria-hidden />
            <label className="mws-field lifecycle-gate__name">
              <span className="caption">Gate name</span>
              <input
                className="mws-input"
                data-ds="input"
                value={gate.name}
                onChange={(event) =>
                  dispatch({ type: 'GATE_UPDATE', lifecycleUid: lifecycle.uid, gateUid: gate.uid, patch: { name: event.target.value } })
                }
              />
            </label>
            <label className="mws-field">
              <span className="caption">Fires on transition — from</span>
              <select
                className="mws-select"
                data-ds="select"
                aria-label={`${gate.name} — from stage`}
                value={gate.fromStageKey}
                onChange={(event) =>
                  dispatch({ type: 'GATE_UPDATE', lifecycleUid: lifecycle.uid, gateUid: gate.uid, patch: { fromStageKey: event.target.value } })
                }
              >
                <option value="">Select a stage</option>
                {stageOptions.map((stage) => (
                  <option key={stage.uid} value={stage.key}>{stage.label}</option>
                ))}
              </select>
            </label>
            <label className="mws-field">
              <span className="caption">To</span>
              <select
                className="mws-select"
                data-ds="select"
                aria-label={`${gate.name} — to stage`}
                value={gate.toStageKey}
                onChange={(event) =>
                  dispatch({ type: 'GATE_UPDATE', lifecycleUid: lifecycle.uid, gateUid: gate.uid, patch: { toStageKey: event.target.value } })
                }
              >
                <option value="">Select a stage</option>
                {stageOptions.map((stage) => (
                  <option key={stage.uid} value={stage.key}>{stage.label}</option>
                ))}
              </select>
            </label>
            <IconButton
              icon={Trash}
              label={`Remove gate ${gate.name}`}
              onClick={() => dispatch({ type: 'GATE_REMOVE', lifecycleUid: lifecycle.uid, gateUid: gate.uid })}
            />
          </div>

          <div className="lifecycle-slots">
            <span className="lifecycle-eyebrow">Approver slots · Every team must approve (AND)</span>
            {gate.slots.map((slot) => (
              <div className="lifecycle-slot" key={slot.uid}>
                <UsersThree size={18} aria-hidden />
                <select
                  className="mws-select lifecycle-inline-input"
                  data-ds="select"
                  aria-label="Approving team"
                  value={slot.roleLabel}
                  onChange={(event) =>
                    dispatch({ type: 'SLOT_UPDATE', lifecycleUid: lifecycle.uid, gateUid: gate.uid, slotUid: slot.uid, roleLabel: event.target.value })
                  }
                >
                  <option value="">Select a team</option>
                  {roleLabels.map((label) => (
                    <option key={label} value={label}>{label}</option>
                  ))}
                  {slot.roleLabel && !roleLabels.includes(slot.roleLabel) && (
                    <option value={slot.roleLabel}>{slot.roleLabel}</option>
                  )}
                </select>
                <span className="lifecycle-slot__count">{eligibleByRole.get(slot.roleLabel) ?? 0} eligible</span>
                <span className="lifecycle-slot__spacer" />
                <button
                  type="button"
                  className="lifecycle-member__remove"
                  aria-label="Remove approving team"
                  onClick={() => dispatch({ type: 'SLOT_REMOVE', lifecycleUid: lifecycle.uid, gateUid: gate.uid, slotUid: slot.uid })}
                >
                  <X size={13} aria-hidden />
                </button>
              </div>
            ))}
            <span>
              <Button
                variant="secondary"
                compact
                onClick={() => dispatch({ type: 'SLOT_ADD', lifecycleUid: lifecycle.uid, gateUid: gate.uid, roleLabel: firstRole })}
              >
                <Plus size={16} aria-hidden /> Add approving team
              </Button>
            </span>
          </div>
        </div>
      ))}
    </section>
  );
}
