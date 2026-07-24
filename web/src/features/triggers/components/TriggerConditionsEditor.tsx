// Editable list of trigger conditions (slice: triggers-request-authoring, Task 2.3). Each row is one
// ANDed "when" clause — field + comparator (+ value). Models the fields RulesEditor grammar, minus
// the show/hide/require action (a trigger fires; it doesn't gate a field), plus a "Today" toggle that
// sets the value to the @today sweep-date token. The condition set is validated server-side at save.

import { Plus, Trash } from '@phosphor-icons/react';

import { Button, IconButton } from '@/shared/components/Button';

import { COMPARATOR_OPTIONS, TODAY_TOKEN } from '../constants';
import {
  type ConditionRow,
  comparatorTakesValue,
  emptyCondition,
  isTodayValue,
} from '../triggerForm';

interface TriggerConditionsEditorProps {
  rows: ConditionRow[];
  /** Request field keys offered as condition targets. */
  fieldKeys: string[];
  onChange: (rows: ConditionRow[]) => void;
}

export function TriggerConditionsEditor({ rows, fieldKeys, onChange }: TriggerConditionsEditorProps) {
  // A stored condition may reference a field key that isn't in the current schema list; keep it
  // selectable so editing a trigger never silently rewrites the clause to the first option.
  const optionKeys = Array.from(
    new Set([...fieldKeys, ...rows.map((row) => row.whenFieldKey)].filter(Boolean)),
  );

  const update = (id: string, patch: Partial<ConditionRow>) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const remove = (id: string) => onChange(rows.filter((row) => row.id !== id));

  const add = () => onChange([...rows, emptyCondition(fieldKeys[0] ?? '')]);

  return (
    <fieldset className="mws-field">
      <legend className="caption">Conditions</legend>
      <p className="caption">Every condition must match for the trigger to fire.</p>
      {rows.length === 0 && <p className="caption">No conditions yet. Add one to start.</p>}
      <ul className="triggers-cond-list">
        {rows.map((row, index) => {
          const usesToday = isTodayValue(row.compareValue);
          return (
            <li key={row.id} className="triggers-cond-row">
              <span className="caption">when</span>
              <label className="visually-hidden" htmlFor={`cond-field-${row.id}`}>
                Condition {index + 1} field
              </label>
              <select
                id={`cond-field-${row.id}`}
                className="mws-select mws-input--compact triggers-cond-row__field"
                value={row.whenFieldKey}
                onChange={(event) => update(row.id, { whenFieldKey: event.target.value })}
              >
                {optionKeys.length === 0 && <option value="">No fields available</option>}
                {optionKeys.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>

              <label className="visually-hidden" htmlFor={`cond-cmp-${row.id}`}>
                Condition {index + 1} comparator
              </label>
              <select
                id={`cond-cmp-${row.id}`}
                className="mws-select mws-input--compact triggers-cond-row__cmp"
                value={row.comparator}
                onChange={(event) =>
                  update(row.id, { comparator: event.target.value as ConditionRow['comparator'] })
                }
              >
                {COMPARATOR_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              {comparatorTakesValue(row.comparator) && (
                <>
                  <label className="visually-hidden" htmlFor={`cond-val-${row.id}`}>
                    Condition {index + 1} value
                  </label>
                  <input
                    id={`cond-val-${row.id}`}
                    className="mws-input mws-input--compact triggers-cond-row__value"
                    placeholder="Value"
                    value={usesToday ? '' : row.compareValue}
                    disabled={usesToday}
                    onChange={(event) => update(row.id, { compareValue: event.target.value })}
                  />
                  <label className="mws-check triggers-cond-row__today">
                    <input
                      type="checkbox"
                      checked={usesToday}
                      onChange={(event) =>
                        update(row.id, { compareValue: event.target.checked ? TODAY_TOKEN : '' })
                      }
                    />
                    <span className="mws-check__box" aria-hidden="true" />
                    <span className="caption">Today</span>
                  </label>
                </>
              )}

              <IconButton icon={Trash} label={`Remove condition ${index + 1}`} onClick={() => remove(row.id)} />
            </li>
          );
        })}
      </ul>
      <Button variant="secondary" compact onClick={add}>
        <Plus size={16} aria-hidden /> Add condition
      </Button>
    </fieldset>
  );
}
