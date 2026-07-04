// Editable list of select options for a Single-/Multi-select field (S30). Controlled by the field
// editor sheet. Each row has a stable client id so add/remove doesn't reorder React keys.

import { Plus, Trash } from '@phosphor-icons/react';

import { Button, IconButton } from '@/shared/components/Button';

export interface OptionRow {
  id: string;
  value: string;
  label: string;
}

interface OptionsEditorProps {
  rows: OptionRow[];
  onChange: (rows: OptionRow[]) => void;
}

export function OptionsEditor({ rows, onChange }: OptionsEditorProps) {
  const update = (id: string, patch: Partial<OptionRow>) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const remove = (id: string) => onChange(rows.filter((row) => row.id !== id));

  const add = () => onChange([...rows, { id: crypto.randomUUID(), value: '', label: '' }]);

  return (
    <fieldset className="mws-field">
      <legend className="caption">Options</legend>
      {rows.length === 0 && <p className="caption">No options yet. Add the choices this field offers.</p>}
      <ul className="fields-option-list">
        {rows.map((row, index) => (
          <li key={row.id} className="fields-option-row">
            <label className="visually-hidden" htmlFor={`opt-value-${row.id}`}>
              Option {index + 1} value
            </label>
            <input
              id={`opt-value-${row.id}`}
              className="mws-input mws-input--compact"
              placeholder="Value"
              value={row.value}
              onChange={(event) => update(row.id, { value: event.target.value })}
            />
            <label className="visually-hidden" htmlFor={`opt-label-${row.id}`}>
              Option {index + 1} label
            </label>
            <input
              id={`opt-label-${row.id}`}
              className="mws-input mws-input--compact"
              placeholder="Label"
              value={row.label}
              onChange={(event) => update(row.id, { label: event.target.value })}
            />
            <IconButton icon={Trash} label={`Remove option ${index + 1}`} onClick={() => remove(row.id)} />
          </li>
        ))}
      </ul>
      <Button variant="secondary" compact onClick={add}>
        <Plus size={16} aria-hidden /> Add option
      </Button>
    </fieldset>
  );
}
