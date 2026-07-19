// A small two-or-more-option segmented control (slice 28) — the composer's Visibility (Shared /
// Personal) and Width (Half / Full) pickers. Buttons expose their selected state via aria-pressed so
// the choice is announced (accessibility.md — never colour alone).

interface SegmentedOption<TValue extends string> {
  value: TValue;
  label: string;
}

interface SegmentedToggleProps<TValue extends string> {
  label: string;
  value: TValue;
  options: ReadonlyArray<SegmentedOption<TValue>>;
  onChange: (value: TValue) => void;
}

export function SegmentedToggle<TValue extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedToggleProps<TValue>) {
  return (
    <div className="dash-field">
      <span className="dash-field__label">{label}</span>
      <div className="dash-seg" role="group" aria-label={label} data-ds="segmented">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`dash-seg__btn${value === option.value ? ' dash-seg__btn--active' : ''}`}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
