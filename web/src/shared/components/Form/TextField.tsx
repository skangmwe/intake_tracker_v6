// Single-line text field (forms-and-input.md). Composes FieldShell for label / helper / error and
// aria wiring; reuses the global .mws-input styles.

import { FieldShell } from './FieldShell';

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  placeholder?: string | undefined;
  autoComplete?: string | undefined;
  disabled?: boolean | undefined;
}

export function TextField({
  label,
  value,
  onChange,
  optional,
  hint,
  error,
  placeholder,
  autoComplete,
  disabled,
}: TextFieldProps) {
  return (
    <FieldShell label={label} dataDs="text-field" optional={optional} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          className="mws-input"
          type="text"
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FieldShell>
  );
}
