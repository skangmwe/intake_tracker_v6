// Date-and-time field (forms-and-input.md) — native <input type="datetime-local"> for picking a
// wall-clock date + time (e.g. an announcement's scheduled publish moment). Reuses .mws-input and the
// shared FieldShell so label / hint / error / describedby wiring matches every other control.

import { FieldShell } from './FieldShell';

interface DateTimeFieldProps {
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

export function DateTimeField({
  label,
  value,
  onChange,
  optional,
  hint,
  error,
  min,
  max,
  disabled,
}: DateTimeFieldProps) {
  return (
    <FieldShell label={label} dataDs="datetime-field" optional={optional} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          className="mws-input"
          type="datetime-local"
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
