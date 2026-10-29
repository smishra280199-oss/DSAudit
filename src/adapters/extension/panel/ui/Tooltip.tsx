import type { ReactNode } from 'react';

/** Keycap, as shown inside tooltips: <Kbd>⌘</Kbd>. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ui-kbd">{children}</kbd>;
}

interface TooltipProps {
  content: string;
  /** Keys of the shortcut, rendered as keycaps, e.g. ['⌥', '⇧', 'S']. */
  shortcut?: string[];
  placement?: 'top' | 'bottom';
  children: ReactNode;
}

/**
 * Dark glossy tooltip with optional keycaps. Shown on hover or keyboard
 * focus of the wrapped control; purely visual (the control keeps its own
 * accessible name).
 */
export function Tooltip({ content, shortcut, placement = 'bottom', children }: TooltipProps) {
  return (
    <span className="ui-tooltip-anchor">
      {children}
      <span className={`ui-tooltip ui-tooltip--${placement}`} aria-hidden="true">
        {content}
        {shortcut && (
          <span className="ui-kbd-group">
            {shortcut.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </span>
        )}
      </span>
    </span>
  );
}
