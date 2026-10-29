import { cx } from './cx';

export type MeterTone = 'auto' | 'accent' | 'neutral';

/** Thin progress bar. "auto" colours by value with the same bands as area health: good ≥ 75, fair ≥ 50, otherwise poor. */
export function Meter({ value, tone = 'auto', label }: { value: number; tone?: MeterTone; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const toneClass = tone === 'auto' ? (pct >= 75 ? 'good' : pct >= 50 ? 'fair' : 'poor') : tone === 'accent' ? 'accent' : null;
  return (
    <div
      className={cx('ui-meter', toneClass && `ui-meter--${toneClass}`)}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className="ui-meter__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
