import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  block?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', block, icon, className, children, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx('ui-button', `ui-button--${variant}`, size === 'sm' && 'ui-button--sm', block && 'ui-button--block', className)}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name; icon-only buttons must have one. */
  label: string;
  outlined?: boolean;
  size?: 'md' | 'lg';
}

export function IconButton({ label, outlined, size = 'md', className, children, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cx('ui-icon-button', outlined && 'ui-icon-button--outlined', size === 'lg' && 'ui-icon-button--lg', className)}
      {...props}
    >
      {children}
    </button>
  );
}
