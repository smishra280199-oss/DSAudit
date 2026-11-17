import { useEffect, useRef } from 'react';
import { cx } from './cx';

interface CheckboxProps {
  /** Accessible name, also shown unless `hideLabel` is set. */
  label: string;
  checked: boolean;
  /** "Some selected": drawn as a dash. Takes precedence over `checked` visually. */
  indeterminate?: boolean;
  hideLabel?: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

/**
 * A native checkbox in the accent colour. Native keeps keyboard, screen
 * reader and indeterminate behaviour for free; `indeterminate` can only be
 * set from script, hence the ref.
 */
export function Checkbox({ label, checked, indeterminate = false, hideLabel, disabled, onChange, className }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className={cx('ui-checkbox', disabled && 'ui-checkbox--disabled', className)} onClick={(e) => e.stopPropagation()}>
      <input
        ref={ref}
        className="ui-checkbox__input"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-checked={indeterminate ? 'mixed' : checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={hideLabel ? 'visually-hidden' : 'ui-checkbox__label'}>{label}</span>
    </label>
  );
}
