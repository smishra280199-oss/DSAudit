import type { CSSProperties } from 'react';

interface SliderProps {
  label: string;
  description?: string;
  /** Allowed values, shown as ticks under the track. */
  steps: number[];
  value: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}

/** A stepped slider: the thumb snaps to the listed steps, labelled underneath. */
export function Slider({ label, description, steps, value, format = String, onChange }: SliderProps) {
  const index = Math.max(0, steps.findIndex((s) => s >= value));
  const fill = steps.length > 1 ? (index / (steps.length - 1)) * 100 : 0;
  return (
    <div className="ui-slider">
      <div className="ui-slider__head">
        <span className="ui-slider__label">{label}</span>
        <span className="ui-slider__value">{format(steps[index]!)}</span>
      </div>
      {description && <p className="ui-slider__description">{description}</p>}
      <input
        className="ui-slider__input"
        type="range"
        min={0}
        max={steps.length - 1}
        step={1}
        value={index}
        aria-label={label}
        aria-valuetext={format(steps[index]!)}
        style={{ '--fill': `${fill}%` } as CSSProperties}
        onChange={(e) => onChange(steps[Number(e.target.value)]!)}
      />
      <div className="ui-slider__ticks" aria-hidden="true">
        {steps.map((step, i) => (
          <span key={step} aria-current={i === index}>
            {format(step)}
          </span>
        ))}
      </div>
    </div>
  );
}
