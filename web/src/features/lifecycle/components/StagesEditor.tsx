// Section 1 of S31 — the lifecycle's stage track. Each stage is a numbered circle with a name
// input and a status-category select; a gate icon marks a stage a gate fires into (matching the
// prototype). Presentational — mutations dispatch to the draft reducer.

import type { Dispatch } from 'react';
import { Plus, SealCheck, X } from '@phosphor-icons/react';
import type { StatusCategory } from '@shared/types';

import { Button } from '@/shared/components/Button';

import type { LifecycleDraft, LifecycleDraftAction } from '../lifecycleDraft';
import { STATUS_CATEGORIES } from '../lifecycleDraft';

interface StagesEditorProps {
  lifecycle: LifecycleDraft;
  dispatch: Dispatch<LifecycleDraftAction>;
}

export function StagesEditor({ lifecycle, dispatch }: StagesEditorProps) {
  const gateTargets = new Set(lifecycle.gates.map((gate) => gate.toStageKey));

  return (
    <section className="lifecycle-card__section" aria-labelledby={`stages-${lifecycle.uid}`}>
      <div className="lifecycle-section-head">
        <span className="lifecycle-badge" id={`stages-${lifecycle.uid}`}>
          <span className="lifecycle-badge__num" aria-hidden>1</span>Stages
        </span>
        <span className="caption">Gate icon marks a transition that requires approval</span>
      </div>

      <div className="lifecycle-stages" role="list">
        {lifecycle.stages.map((stage, index) => (
          <div className="lifecycle-stage-wrap" key={stage.uid} role="listitem">
            <div className="lifecycle-stage">
              <span className="lifecycle-stage__top">
                <span className="lifecycle-stage__circle" aria-hidden>{index + 1}</span>
                <button
                  type="button"
                  className="lifecycle-member__remove"
                  aria-label={`Remove stage ${stage.label}`}
                  onClick={() => dispatch({ type: 'STAGE_REMOVE', lifecycleUid: lifecycle.uid, stageUid: stage.uid })}
                >
                  <X size={13} aria-hidden />
                </button>
              </span>
              <input
                className="mws-input mws-input--compact"
                data-ds="input"
                aria-label={`Stage ${index + 1} name`}
                value={stage.label}
                onChange={(event) =>
                  dispatch({ type: 'STAGE_UPDATE', lifecycleUid: lifecycle.uid, stageUid: stage.uid, patch: { label: event.target.value } })
                }
              />
              <select
                className="mws-select mws-input--compact"
                data-ds="select"
                aria-label={`Status category for ${stage.label}`}
                value={stage.statusCategory}
                onChange={(event) =>
                  dispatch({
                    type: 'STAGE_UPDATE',
                    lifecycleUid: lifecycle.uid,
                    stageUid: stage.uid,
                    patch: { statusCategory: event.target.value as StatusCategory },
                  })
                }
              >
                {STATUS_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            {gateTargets.has(stage.key) && (
              <SealCheck className="lifecycle-stage__gate" size={18} aria-label="Gate on entry" />
            )}
          </div>
        ))}
      </div>

      <p className="caption">
        Each stage maps to a status category (Intake · Execution · Validation · Delivery) used for dashboards and cross-lifecycle
        rollups.
      </p>
      <span>
        <Button variant="secondary" compact onClick={() => dispatch({ type: 'STAGE_ADD', lifecycleUid: lifecycle.uid })}>
          <Plus size={16} aria-hidden /> Add stage
        </Button>
      </span>
    </section>
  );
}
