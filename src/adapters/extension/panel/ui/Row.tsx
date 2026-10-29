import type { KeyboardEvent, ReactNode } from 'react';
import { cx } from './cx';

interface RowProps {
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  /** Let title and meta wrap instead of truncating, for sentences. */
  wrap?: boolean;
  trailing?: ReactNode;
  /** Revealed on hover, e.g. a "more" menu. */
  actions?: ReactNode;
  selected?: boolean;
  expanded?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}

/**
 * A list row: leading visual, title over meta, trailing figures and hover
 * actions. Interactive rows lift into a card on hover.
 */
export function Row({ leading, title, meta, wrap, trailing, actions, selected, expanded, onClick, children }: RowProps) {
  const onKeyDown = (event: KeyboardEvent) => {
    if (onClick && (event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
      event.preventDefault();
      onClick();
    }
  };
  return (
    <li>
      <div
        className={cx('ui-row', onClick && 'ui-row--interactive', selected && 'ui-row--selected', wrap && 'ui-row--wrap')}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-expanded={expanded}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        {leading}
        <div className="ui-row__main">
          <span className="ui-row__title">{title}</span>
          {meta && <span className="ui-row__meta">{meta}</span>}
        </div>
        {trailing && <div className="ui-row__trail">{trailing}</div>}
        {actions && (
          <div className="ui-row__actions" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
      {children}
    </li>
  );
}

export function List({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className="ui-list" aria-label={label}>
      {children}
    </ul>
  );
}
