// Numeric field (forms-and-input.md) — uses inputMode instead of type="number" to drop the
// browser stepper and surface the numeric keyboard. The value stays a string so the consumer owns
// parsing/validation. Reuses the global .mws-input styles.

import { FieldShell } from './FieldShell';

interface NumberFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  /** Use "decimal" when the value may carry a fractional part; defaults to "numeric". */
  inputMode?: 'numeric' | 'decimal' | undefined;
}

export function NumberField({
  label,
  value,
  onChange,
  optional,
  hint,
  error,
  placeholder,
  disabled,
  inputMode = 'numeric',
}: NumberFieldProps) {
  return (
    <FieldShell label={label} dataDs="number-field" optional={optional} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          className="mws-input"
          type="text"
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FieldShell>
  );
}
