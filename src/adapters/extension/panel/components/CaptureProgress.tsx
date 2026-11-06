import { Button, Spinner } from '../ui';
import { useAuditState, useController } from '../use-audit';

/** What a long capture is doing ("Page 2 of 6 · Screenshots 8 of 20"), with a way to stop a site capture. */
export function CaptureProgress() {
  const controller = useController();
  const { status, progress } = useAuditState();
  if (status !== 'capturing' || !progress) return null;
  return (
    <div className="capture-progress" role="status" aria-live="polite">
      <Spinner label="Capturing" />
      <span>{progress}</span>
      {progress.startsWith('Page ') && (
        <Button size="sm" variant="ghost" onClick={() => controller.cancelSiteCapture()}>
          Stop
        </Button>
      )}
    </div>
  );
}
