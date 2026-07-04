// Range slider (used by the Priority-Score widget). Native <input type="range"> tinted with
// accent-color, paired with a monospace value readout. Composes FieldShell for the label + helper.

import { FieldShell } from './FieldShell';

import './RangeSlider.css';

interface RangeSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  optional?: boolean | undefined;
  hint?: string | undefined;
  disabled?: boolean | undefined;
  /** Formats the readout (e.g. to add a suffix); defaults to the raw number. */
  formatValue?: ((value: number) => string) | undefined;
}

export function RangeSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  optional,
  hint,
  disabled,
  formatValue,
}: RangeSliderProps) {
  const readout = formatValue ? formatValue(value) : String(value);
  return (
    <FieldShell label={label} dataDs="range-slider" optional={optional} hint={hint}>
      {({ id, describedBy }) => (
        <div className="ast-range">
          <input
            id={id}
            className="ast-range__input"
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            aria-describedby={describedBy}
            onChange={(event) => onChange(Number(event.target.value))}
          />
          <output className="ast-range__value" htmlFor={id}>
            {readout}
          </output>
        </div>
      )}
    </FieldShell>
  );
}
