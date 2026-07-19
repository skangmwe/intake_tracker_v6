// The Lifecycles selector at the top of S31 — pick a lifecycle to edit from a dropdown, add/remove
// one, rename it, and set which is the default. Per v2 (slice 27) the lifecycle *name* is the single
// label (the separate "Request type" was dropped), and the selector is a dropdown so any number of
// lifecycles stay compact. Presentational; edits dispatch to the draft reducer, while
// add/remove/select round-trip through the page so selection stays valid.

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

  // The default cannot be removed outright — set another lifecycle as default first (matches prototype).
  const canRemove = lifecycles.length > 1 && !selected.isDefault;

  return (
    <section className="mws-card lifecycle-card" aria-labelledby="lifecycles-heading">
      <div className="lifecycle-bar__row">
        <h2 id="lifecycles-heading" className="h3">Lifecycles</h2>
        <Button variant="secondary" compact onClick={onNew}>
          <Plus size={16} aria-hidden /> New lifecycle
        </Button>
      </div>

      <div className="lifecycle-selectrow">
        <label className="mws-field lifecycle-select">
          <span className="caption">Lifecycle</span>
          <select
            className="mws-input"
            data-ds="select"
            value={selected.uid}
            aria-label="Select lifecycle"
            onChange={(event) => onSelect(event.target.value)}
          >
            {lifecycles.map((lifecycle) => (
              <option key={lifecycle.uid} value={lifecycle.uid}>
                {lifecycle.name}
                {lifecycle.isDefault ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="mws-field lifecycle-name">
          <span className="caption">Lifecycle name</span>
          <input
            className="mws-input"
            data-ds="input"
            value={selected.name}
            onChange={(event) => dispatch({ type: 'LIFECYCLE_UPDATE', uid: selected.uid, patch: { name: event.target.value } })}
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

        {canRemove && (
          <IconButton icon={Trash} label={`Remove lifecycle ${selected.name}`} onClick={() => onRemove(selected.uid)} />
        )}
      </div>
    </section>
  );
}
