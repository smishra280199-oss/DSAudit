import type { ReactNode } from 'react';
import { cx } from './cx';

interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Card({ title, subtitle, action, footer, className, children }: CardProps) {
  return (
    <section className={cx('ui-card', className)}>
      {(title || subtitle || action) && (
        <header className="ui-card__header">
          <div>
            {title && <h2 className="ui-card__title">{title}</h2>}
            {subtitle && <p className="ui-card__subtitle">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children !== undefined && <div className="ui-card__body">{children}</div>}
      {footer && <footer className="ui-card__footer">{footer}</footer>}
    </section>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="ui-section-label">{children}</h3>;
}
