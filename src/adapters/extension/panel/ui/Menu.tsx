import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconButton } from './Button';
import { cx } from './cx';
import { MoreIcon } from './icons';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

export interface MenuSection {
  label?: string;
  items: MenuItem[];
}

interface MenuProps {
  label: string;
  sections: MenuSection[];
  /** Custom trigger; defaults to a "more" icon button. */
  trigger?: (props: { onClick: () => void; expanded: boolean }) => ReactNode;
  placement?: 'down' | 'up';
}

/** A popover menu with optional labelled sections; destructive items render in red. */
export function Menu({ label, sections, trigger, placement = 'down' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    ref.current?.querySelector<HTMLButtonElement>('.ui-menu__item')?.focus();
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const toggle = () => setOpen((o) => !o);
  return (
    <div className="ui-menu-anchor" ref={ref}>
      {trigger ? (
        trigger({ onClick: toggle, expanded: open })
      ) : (
        <IconButton label={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          <MoreIcon />
        </IconButton>
      )}
      {open && (
        <div className={cx('ui-menu', placement === 'up' && 'ui-menu--up')} role="menu" aria-label={label}>
          {sections.map((section, i) => (
            <div key={section.label ?? i} role="group">
              {i > 0 && <div className="ui-menu__separator" />}
              {section.label && <div className="ui-menu__label">{section.label}</div>}
              {section.items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className={cx('ui-menu__item', item.danger && 'ui-menu__item--danger')}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
