/** Thin neutral progress bar, styled after the reference slider track. */
export function Meter({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className="ui-meter"
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
