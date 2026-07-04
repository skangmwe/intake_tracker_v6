// Shared field frame (forms-and-input.md anatomy): a visible <label>, an optional helper line
// that the error message replaces in the same slot, and the aria wiring (id + aria-describedby +
// aria-invalid) handed to the control via a render prop. Optional fields are marked "(optional)";
// required fields are never starred. Reuses the global .mws-field styles.

import { useId, type ReactNode } from 'react';

export interface FieldControl {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
}

interface FieldShellProps {
  label: string;
  dataDs: string;
  optional?: boolean | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  children: (control: FieldControl) => ReactNode;
}

export function FieldShell({ label, dataDs, optional = false, hint, error, children }: FieldShellProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="mws-field" data-ds={dataDs}>
      <label className="mws-field__label" htmlFor={id}>
        {label}
        {optional && <span className="mws-field__optional">(optional)</span>}
      </label>
      {error ? (
        <span className="mws-field__error" id={errorId} role="alert">
          {error}
        </span>
      ) : (
        hint && (
          <span className="mws-field__hint" id={hintId}>
            {hint}
          </span>
        )
      )}
      {children({ id, describedBy, invalid: Boolean(error) })}
    </div>
  );
}
