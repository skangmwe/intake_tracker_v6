// Composition of the Lifecycles bar + the selected lifecycle's three numbered sections (Stages /
// Gates / Approver teams). Extracted from LifecyclePage so each component stays within the size
// ceiling (web-component-architecture.md). Presentational — all state lives in the page.

import type { Dispatch } from 'react';
import type { ApproverTeamDto, UserId } from '@shared/types';

import type { LifecycleDraft, LifecycleDraftAction } from '../lifecycleDraft';
import { ApproverTeamsEditor } from './ApproverTeamsEditor';
import { GatesEditor } from './GatesEditor';
import { LifecyclesBar } from './LifecyclesBar';
import { StagesEditor } from './StagesEditor';

interface LifecycleEditorProps {
  lifecycles: LifecycleDraft[];
  selected: LifecycleDraft;
  selectedUid: string;
  roleLabels: string[];
  teams: ApproverTeamDto[];
  eligibleByRole: Map<string, number>;
  dispatch: Dispatch<LifecycleDraftAction>;
  onSelect: (uid: string) => void;
  onNew: () => void;
  onRemove: (uid: string) => void;
  onAddMember: (roleLabel: string, person: string) => Promise<void>;
  onRemoveMember: (roleLabel: string, userId: UserId) => void;
  addError: string | null;
}

export function LifecycleEditor({
  lifecycles,
  selected,
  selectedUid,
  roleLabels,
  teams,
  eligibleByRole,
  dispatch,
  onSelect,
  onNew,
  onRemove,
  onAddMember,
  onRemoveMember,
  addError,
}: LifecycleEditorProps) {
  return (
    <>
      <LifecyclesBar
        lifecycles={lifecycles}
        selectedUid={selectedUid}
        onSelect={onSelect}
        onNew={onNew}
        onRemove={onRemove}
        dispatch={dispatch}
      />

      <section className="mws-card lifecycle-card--split" aria-label={`Lifecycle ${selected.name}`}>
        <div className="lifecycle-card__section">
          <h2 className="h3">{selected.name}</h2>
          <span className="caption">
            Request type · {selected.requestType || '—'} — the process every request of this type moves through
          </span>
        </div>
        <StagesEditor lifecycle={selected} dispatch={dispatch} />
        <GatesEditor lifecycle={selected} roleLabels={roleLabels} eligibleByRole={eligibleByRole} dispatch={dispatch} />
        <ApproverTeamsEditor teams={teams} onAdd={onAddMember} onRemove={onRemoveMember} addError={addError} />
      </section>
    </>
  );
}
