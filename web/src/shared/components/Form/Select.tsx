// Native select (forms-and-input.md — native <select> for ≤10 options). An optional placeholder
// renders as a disabled first option. Reuses the global .mws-select styles.

import { FieldShell } from './FieldShell';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  optional?: boolean | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
}

export function Select({
  label,
  value,
  onChange,
  options,
  optional,
  hint,
  error,
  placeholder,
  disabled,
}: SelectProps) {
  return (
    <FieldShell label={label} dataDs="select" optional={optional} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          className="mws-select"
          value={value}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}
