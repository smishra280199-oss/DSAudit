import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, children, action }: EmptyStateProps) {
  return (
    <div className="ui-empty">
      <div className="ui-empty__icon">{icon}</div>
      <h2 className="ui-empty__title">{title}</h2>
      {children && <p className="ui-empty__text">{children}</p>}
      {action}
    </div>
  );
}
