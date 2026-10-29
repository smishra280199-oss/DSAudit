import type { CSSProperties, ReactNode } from 'react';
import { cx } from './cx';

export type Tone = 'neutral' | 'accent' | 'danger' | 'warning' | 'success' | 'info';

/**
 * A grey chip, like the reference's “App” tag. Status tones add a coloured dot
 * (like “● Production”) rather than tinting the chip; accent colours the text.
 */
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const dot = tone !== 'neutral' && tone !== 'accent';
  return (
    <span className={cx('ui-badge', tone !== 'neutral' && `ui-badge--${tone}`)}>
      {dot && <span className="ui-dot" />}
      {children}
    </span>
  );
}

export function Swatch({ color, size = 16, title }: { color: string; size?: number; title?: string }) {
  const style: CSSProperties = { background: color, width: size, height: size };
  return <span className="ui-swatch" style={style} title={title ?? color} />;
}

/** Round avatar showing a favicon, falling back to the first letter of the label. */
export function Avatar({ src, label, small }: { src?: string; label: string; small?: boolean }) {
  return (
    <span className={cx('ui-avatar', small && 'ui-avatar--sm')} aria-hidden="true">
      {src ? <img src={src} alt="" /> : label.trim().charAt(0).toUpperCase()}
    </span>
  );
}
