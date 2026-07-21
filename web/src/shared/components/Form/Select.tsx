// Native select (forms-and-input.md — native <select> for ≤10 options). An optional placeholder
// renders as a disabled first option. Reuses the global .mws-select styles.

import { FieldShell } from './FieldShell';

export interface SelectOption {
  value: string;
  label: string;
}

/** A labelled group of options, rendered as an <optgroup> (e.g. the Active / Closed status picker). */
export interface SelectOptionGroup {
  label: string;
  options: SelectOption[];
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Flat options. Provide this OR `groups` (groups take precedence). */
  options?: SelectOption[] | undefined;
  /** Grouped options, rendered as <optgroup> sections. Takes precedence over `options`. */
  groups?: SelectOptionGroup[] | undefined;
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
  groups,
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
          {groups
            ? groups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))
            : (options ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
        </select>
      )}
    </FieldShell>
  );
}
