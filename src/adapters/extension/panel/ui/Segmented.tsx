import { cx } from './cx';

interface SegmentedProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Stretch to the container width with tighter segments. */
  fill?: boolean;
}

/** Pill-shaped segmented control (e.g. "All | Mine"). The selected segment lifts and takes the accent colour. */
export function Segmented<T extends string>({ label, options, value, onChange, fill }: SegmentedProps<T>) {
  return (
    <div className={cx('ui-segmented', fill && 'ui-segmented--fill')} role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className="ui-segmented__item"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
