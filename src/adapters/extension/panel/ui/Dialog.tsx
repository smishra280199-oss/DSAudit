import { useEffect, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

/** Modal dialog on the native <dialog> element (focus trap and Escape for free). */
export function Dialog({ open, title, subtitle, onClose, footer, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="ui-dialog" aria-labelledby="ui-dialog-title" onClose={onClose} onCancel={onClose}>
      <header className="ui-dialog__header">
        <h2 id="ui-dialog-title" className="ui-dialog__title">
          {title}
        </h2>
        {subtitle && <p className="ui-dialog__subtitle">{subtitle}</p>}
      </header>
      <div className="ui-dialog__body">{children}</div>
      {footer && <footer className="ui-dialog__footer">{footer}</footer>}
    </dialog>
  );
}

export function DialogSection({ children }: { children: ReactNode }) {
  return <div className="ui-dialog__section">{children}</div>;
}
