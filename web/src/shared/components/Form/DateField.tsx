// Date field (forms-and-input.md) — native <input type="date"> for desktop. Reuses .mws-input.

import { FieldShell } from './FieldShell';

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  min?: string | undefined;
  max?: string | undefined;
  disabled?: boolean | undefined;
}

export function DateField({
  label,
  value,
  onChange,
  optional,
  hint,
  error,
  min,
  max,
  disabled,
}: DateFieldProps) {
  return (
    <FieldShell label={label} dataDs="date-field" optional={optional} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          className="mws-input"
          type="date"
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FieldShell>
  );
}
