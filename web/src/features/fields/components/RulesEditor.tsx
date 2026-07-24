// Editable list of condition-engine rules for a field (S30 / BS §3.1). Each row is a show / hide /
// require rule keyed on another field. The dependency graph is validated server-side at save
// (acyclic + depth<=3); a cycle surfaces as a save error. Controlled by the field editor sheet.

import { Plus, Trash } from '@phosphor-icons/react';
import type { RuleAction, RuleComparator } from '@shared/types';

import { Button, IconButton } from '@/shared/components/Button';

import { COMPARATOR_OPTIONS, RULE_ACTION_OPTIONS } from '../constants';

export interface RuleRow {
  id: string;
  action: RuleAction;
  whenFieldKey: string;
  comparator: RuleComparator;
  compareValue: string;
}

interface RulesEditorProps {
  rows: RuleRow[];
  fieldKeys: string[];
  onChange: (rows: RuleRow[]) => void;
  disabled?: boolean;
}

const COMPARATORS_WITHOUT_VALUE: readonly RuleComparator[] = ['isSet', 'isNotSet'];

export function RulesEditor({ rows, fieldKeys, onChange, disabled = false }: RulesEditorProps) {
  const update = (id: string, patch: Partial<RuleRow>) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const remove = (id: string) => onChange(rows.filter((row) => row.id !== id));

  const add = () =>
    onChange([
      ...rows,
      {
        id: crypto.randomUUID(),
        action: 'Show',
        whenFieldKey: fieldKeys[0] ?? '',
        comparator: 'eq',
        compareValue: '',
      },
    ]);

  return (
    <fieldset className="mws-field">
      <legend className="caption">Conditional rules</legend>
      {rows.length === 0 && (
        <p className="caption">
          No rules. Add a rule to show, hide, or require this field based on another field.
        </p>
      )}
      <ul className="fields-rule-list">
        {rows.map((row, index) => (
          <li key={row.id} className="fields-rule-row">
            <label className="visually-hidden" htmlFor={`rule-action-${row.id}`}>
              Rule {index + 1} action
            </label>
            <select
              id={`rule-action-${row.id}`}
              className="mws-select mws-input--compact"
              value={row.action}
              disabled={disabled}
              onChange={(event) => update(row.id, { action: event.target.value as RuleAction })}
            >
              {RULE_ACTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="caption">when</span>
            <label className="visually-hidden" htmlFor={`rule-field-${row.id}`}>
              Rule {index + 1} field
            </label>
            <select
              id={`rule-field-${row.id}`}
              className="mws-select mws-input--compact"
              value={row.whenFieldKey}
              disabled={disabled}
              onChange={(event) => update(row.id, { whenFieldKey: event.target.value })}
            >
              {fieldKeys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
            <label className="visually-hidden" htmlFor={`rule-cmp-${row.id}`}>
              Rule {index + 1} comparator
            </label>
            <select
              id={`rule-cmp-${row.id}`}
              className="mws-select mws-input--compact"
              value={row.comparator}
              disabled={disabled}
              onChange={(event) =>
                update(row.id, { comparator: event.target.value as RuleComparator })
              }
            >
              {COMPARATOR_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {!COMPARATORS_WITHOUT_VALUE.includes(row.comparator) && (
              <>
                <label className="visually-hidden" htmlFor={`rule-val-${row.id}`}>
                  Rule {index + 1} value
                </label>
                <input
                  id={`rule-val-${row.id}`}
                  className="mws-input mws-input--compact"
                  placeholder="Value"
                  value={row.compareValue}
                  disabled={disabled}
                  onChange={(event) => update(row.id, { compareValue: event.target.value })}
                />
              </>
            )}
            <IconButton
              icon={Trash}
              label={`Remove rule ${index + 1}`}
              onClick={() => remove(row.id)}
              disabled={disabled}
            />
          </li>
        ))}
      </ul>
      <Button variant="secondary" compact onClick={add} disabled={disabled}>
        <Plus size={16} aria-hidden /> Add rule
      </Button>
    </fieldset>
  );
}
