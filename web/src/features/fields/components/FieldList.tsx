// The workspace field list table (S30). Shows the scannable columns; the full per-field config lives
// in the editor sheet. Platform-defined fields are excluded here — they render in the read-only band.

import { PencilSimple } from '@phosphor-icons/react';
import type { FieldDefinitionDto } from '@shared/types';

import { Button } from '@/shared/components/Button';

import { fieldTypeLabel } from '../constants';

interface FieldListProps {
  fields: FieldDefinitionDto[];
  onEdit: (field: FieldDefinitionDto) => void;
  onRetire: (field: FieldDefinitionDto) => void;
}

export function FieldList({ fields, onEdit, onRetire }: FieldListProps) {
  return (
    <div className="mws-table-shell">
      <table className="mws-table" data-ds="table">
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Type</th>
            <th scope="col">Category</th>
            <th scope="col">Required</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.id}>
              <td>
                <span className="body">{field.displayName}</span>
                <br />
                <code className="mws-ident">{field.fieldKey}</code>
              </td>
              <td>{fieldTypeLabel(field.fieldType)}</td>
              <td>{field.category}</td>
              <td>{field.isRequired ? 'Yes' : '—'}</td>
              <td>
                {field.isRetired ? (
                  <span className="mws-badge mws-badge--archived">Retired</span>
                ) : (
                  <span className="mws-badge mws-badge--live">Active</span>
                )}
              </td>
              <td className="fields-row-actions">
                <Button variant="secondary" compact onClick={() => onEdit(field)}>
                  <PencilSimple size={16} aria-hidden /> Edit
                </Button>
                {!field.isRetired && (
                  <Button variant="secondary" compact onClick={() => onRetire(field)}>
                    Retire
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
