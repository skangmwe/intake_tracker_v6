// Multi-line text field (forms-and-input.md). Reuses the global .mws-textarea styles.

import { FieldShell } from './FieldShell';

interface TextAreaProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  placeholder?: string | undefined;
  rows?: number | undefined;
  disabled?: boolean | undefined;
}

export function TextArea({
  label,
  value,
  onChange,
  optional,
  hint,
  error,
  placeholder,
  rows = 4,
  disabled,
}: TextAreaProps) {
  return (
    <FieldShell label={label} dataDs="textarea" optional={optional} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          className="mws-textarea"
          value={value}
          rows={rows}
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
