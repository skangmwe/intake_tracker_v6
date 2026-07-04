// Renders one Request field from its FieldDefinitionDto — the data-driven bridge between the
// workspace field schema and the shared Form controls. Used by the S3 intake form and the S4
// Intake tab. Optional fields are marked (never required — forms-and-input.md). Derived/calculation
// fields render read-only. Field types the seed doesn't yet configure options for fall back to text.

import type { FieldDefinitionDto } from '@shared/types';

import { DateField } from '@/shared/components/Form/DateField';
import { NumberField } from '@/shared/components/Form/NumberField';
import { Select } from '@/shared/components/Form/Select';
import { TextArea } from '@/shared/components/Form/TextArea';
import { TextField } from '@/shared/components/Form/TextField';

interface RequestFieldControlProps {
  field: FieldDefinitionDto;
  value: unknown;
  onChange: (value: unknown) => void;
  required: boolean;
  error?: string | undefined;
  disabled?: boolean | undefined;
}

function asText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

export function RequestFieldControl({ field, value, onChange, required, error, disabled }: RequestFieldControlProps) {
  const optional = !required;
  const label = field.displayName;
  const hint = field.helpText ?? undefined;
  const text = asText(value);

  switch (field.fieldType) {
    case 'LongText':
    case 'RichText':
      return (
        <TextArea label={label} value={text} onChange={onChange} optional={optional} hint={hint} error={error} rows={3} disabled={disabled} />
      );

    case 'Number':
    case 'Decimal':
    case 'Currency':
    case 'Percent':
      return (
        <NumberField
          label={label}
          value={text}
          onChange={onChange}
          optional={optional}
          hint={hint}
          error={error}
          disabled={disabled}
          inputMode={field.fieldType === 'Number' ? 'numeric' : 'decimal'}
        />
      );

    case 'Date':
    case 'DateTime':
      return <DateField label={label} value={text} onChange={onChange} optional={optional} hint={hint} error={error} disabled={disabled} />;

    case 'SingleSelect': {
      const options = [
        { value: '', label: 'Select…' },
        ...field.options.map((option) => ({ value: option.value, label: option.label })),
      ];
      return <Select label={label} value={text} onChange={onChange} options={options} optional={optional} hint={hint} error={error} disabled={disabled} />;
    }

    case 'Boolean':
      return (
        <label className="request-check">
          <input
            type="checkbox"
            checked={text === 'true'}
            onChange={(event) => onChange(event.target.checked)}
            disabled={disabled}
          />
          <span>{label}</span>
        </label>
      );

    case 'Calculation':
    case 'DerivedCategory':
      return (
        <div className="request-readonly-field">
          <span className="request-readonly-field__label">{label}</span>
          <span className="request-readonly-field__value">{text || '—'}</span>
        </div>
      );

    // ShortText, Url, UserReference, MultiSelect (no picker/multi primitive this slice) → text.
    default:
      return (
        <TextField
          label={label}
          value={text}
          onChange={onChange}
          optional={optional}
          hint={hint}
          error={error}
          disabled={disabled}
          {...(field.fieldType === 'Url' ? { autoComplete: 'url' } : {})}
        />
      );
  }
}
