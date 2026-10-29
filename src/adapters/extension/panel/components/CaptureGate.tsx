import type { ReactNode } from 'react';
import { CAPTURABILITY_MESSAGES } from '../../../../shared/restricted';
import { AlertIcon, Button, EmptyState, Kbd, LockIcon, LogoMark, Spinner } from '../ui';
import { useAuditState, useController } from '../use-audit';

/**
 * Renders its children only when there is an audit to show; otherwise
 * explains why not (restricted page, capturing, error, not captured yet).
 */
export function CaptureGate({ children }: { children: ReactNode }) {
  const controller = useController();
  const { audit, status, error, capturability, tab } = useAuditState();

  if (status === 'capturing' && !audit) {
    return (
      <EmptyState icon={<Spinner label="Capturing" />} title="Reading the page…">
        Walking the DOM, computed styles and every readable stylesheet.
      </EmptyState>
    );
  }
  if (audit) return <>{children}</>;
  if (capturability === 'needs-access') {
    return (
      <EmptyState
        icon={<LockIcon size={20} />}
        title="No access to this tab yet"
        action={
          <Button variant="primary" onClick={() => void controller.requestHostAccess()}>
            Allow access to all sites
          </Button>
        }
      >
        {CAPTURABILITY_MESSAGES[capturability]}
      </EmptyState>
    );
  }
  if (capturability !== 'ok') {
    return (
      <EmptyState icon={<LockIcon size={20} />} title="This page can’t be audited">
        {CAPTURABILITY_MESSAGES[capturability]}
      </EmptyState>
    );
  }
  if (status === 'error') {
    return (
      <EmptyState
        icon={<AlertIcon size={20} />}
        title="The capture didn’t finish"
        action={
          <Button variant="primary" onClick={() => void controller.capture()}>
            Try again
          </Button>
        }
      >
        {error ?? 'Something went wrong.'} Reloading the page often helps.
      </EmptyState>
    );
  }
  return (
    <EmptyState
      icon={<LogoMark size={28} />}
      title="Audit this page"
      action={
        <div className="capture-cta">
          <Button variant="primary" disabled={!tab} onClick={() => void controller.capture()}>
            Capture page
          </Button>
          <span className="capture-cta__hint">
            Open this panel anywhere with <Kbd>Alt</Kbd> <Kbd>⇧</Kbd> <Kbd>S</Kbd>
          </span>
        </div>
      }
    >
      System Audit reads what this page renders and how its CSS is written, then infers the design system behind it. No
      source code needed; nothing leaves your machine.
    </EmptyState>
  );
}
