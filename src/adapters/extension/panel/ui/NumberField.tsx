import { useEffect, useId, useState } from 'react';

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  hint?: string;
  /** Shown after the number, e.g. "h" or "%". */
  suffix?: string;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const tidy = (n: number) => Math.round(n * 100) / 100;

/**
 * A number field with − and + steppers. Typing commits on every valid
 * number; empty or invalid input is ignored and the last value is kept.
 */
export function NumberField({ label, value, onChange, min, max, step, hint, suffix }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const commit = (raw: string) => {
    setText(raw);
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) return;
    onChange(tidy(clamp(n, min, max)));
  };
  const nudge = (direction: 1 | -1) => onChange(tidy(clamp(value + direction * step, min, max)));

  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      <div className="ui-number">
        <button type="button" className="ui-number__step" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => nudge(-1)}>
          −
        </button>
        <input
          id={id}
          className="ui-field__input ui-number__input"
          inputMode="decimal"
          value={text}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setText(String(value))}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        {suffix && <span className="ui-number__suffix">{suffix}</span>}
        <button type="button" className="ui-number__step" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => nudge(1)}>
          +
        </button>
      </div>
      {hint && (
        <span className="ui-field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
    </div>
  );
}
