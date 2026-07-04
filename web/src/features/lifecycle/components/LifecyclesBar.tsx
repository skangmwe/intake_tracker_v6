// The Lifecycles bar at the top of S31 — pick a lifecycle to edit, add/remove one, rename it and
// its request type, and set which is the default. Presentational; edits dispatch to the draft
// reducer, while add/remove/select round-trip through the page so selection stays valid.

import type { Dispatch } from 'react';
import { Plus, Star, StarFour, Trash } from '@phosphor-icons/react';

import { Button } from '@/shared/components/Button';
import { IconButton } from '@/shared/components/Button/IconButton';

import type { LifecycleDraft, LifecycleDraftAction } from '../lifecycleDraft';

interface LifecyclesBarProps {
  lifecycles: LifecycleDraft[];
  selectedUid: string;
  onSelect: (uid: string) => void;
  onNew: () => void;
  onRemove: (uid: string) => void;
  dispatch: Dispatch<LifecycleDraftAction>;
}

export function LifecyclesBar({ lifecycles, selectedUid, onSelect, onNew, onRemove, dispatch }: LifecyclesBarProps) {
  const selected = lifecycles.find((lifecycle) => lifecycle.uid === selectedUid) ?? lifecycles[0];
  if (!selected) return null;

  return (
    <section className="mws-card lifecycle-card" aria-labelledby="lifecycles-heading">
      <div className="lifecycle-bar__row">
        <h2 id="lifecycles-heading" className="h3">Lifecycles</h2>
        <Button variant="secondary" compact onClick={onNew}>
          <Plus size={16} aria-hidden /> New lifecycle
        </Button>
      </div>

      <div className="lifecycle-chips">
        {lifecycles.map((lifecycle) => (
          <button
            key={lifecycle.uid}
            type="button"
            className="lifecycle-chip"
            aria-pressed={lifecycle.uid === selected.uid}
            onClick={() => onSelect(lifecycle.uid)}
          >
            <span className="lifecycle-chip__name">
              {lifecycle.name}
              {lifecycle.isDefault && <span className="lifecycle-chip__meta"> · default</span>}
            </span>
            <span className="lifecycle-chip__meta">Type · {lifecycle.requestType || '—'}</span>
          </button>
        ))}
      </div>

      <div className="lifecycle-editrow">
        <label className="mws-field">
          <span className="caption">Lifecycle name</span>
          <input
            className="mws-input"
            data-ds="input"
            value={selected.name}
            onChange={(event) => dispatch({ type: 'LIFECYCLE_UPDATE', uid: selected.uid, patch: { name: event.target.value } })}
          />
        </label>
        <label className="mws-field">
          <span className="caption">Request type (chosen at intake)</span>
          <input
            className="mws-input"
            data-ds="input"
            value={selected.requestType}
            onChange={(event) => dispatch({ type: 'LIFECYCLE_UPDATE', uid: selected.uid, patch: { requestType: event.target.value } })}
          />
        </label>
        {selected.isDefault ? (
          <span className="lifecycle-default-flag">
            <StarFour size={14} weight="fill" aria-hidden /> Default lifecycle
          </span>
        ) : (
          <Button variant="secondary" compact onClick={() => dispatch({ type: 'LIFECYCLE_SET_DEFAULT', uid: selected.uid })}>
            <Star size={16} aria-hidden /> Make default
          </Button>
        )}
        {lifecycles.length > 1 && (
          <IconButton icon={Trash} label={`Remove lifecycle ${selected.name}`} onClick={() => onRemove(selected.uid)} />
        )}
      </div>
    </section>
  );
}
