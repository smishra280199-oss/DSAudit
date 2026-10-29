import { useEffect, useState } from 'react';
import type { ReportBranding } from '../../../../report/branding';
import { Button, Dialog, DialogSection, TextField } from '../ui';
import { useAuditState, useController } from '../use-audit';

/**
 * Who the report is from and who it is for. Agency details are remembered
 * for every report; the client name is remembered per site.
 */
export function ReportDetailsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const controller = useController();
  const { branding, audit } = useAuditState();
  const [draft, setDraft] = useState<ReportBranding>(branding);
  const [clientName, setClientName] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraft(branding);
    setClientName(controller.clientName());
  }, [open, branding, controller]);

  const update = (patch: Partial<ReportBranding>) => setDraft((d) => ({ ...d, ...patch }));
  const save = () => {
    void controller.updateReportDetails(draft, clientName);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Report details"
      subtitle="Shown on the cover and contact section of client reports."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      {audit && (
        <DialogSection>
          <TextField label="Client" value={clientName} onChange={setClientName} hint="The company this report is for. Remembered for this site." />
        </DialogSection>
      )}
      <DialogSection>
        <div className="form-stack">
          <TextField label="Your agency" value={draft.agencyName} placeholder="Northbeam Studio" onChange={(agencyName) => update({ agencyName })} />
          <TextField label="Your name" value={draft.preparedBy} placeholder="Alex Rivera" onChange={(preparedBy) => update({ preparedBy })} />
          <TextField label="Email" type="email" value={draft.email} placeholder="alex@studio.com" onChange={(email) => update({ email })} />
          <TextField label="Website" type="url" value={draft.website} placeholder="studio.com" onChange={(website) => update({ website })} />
        </div>
      </DialogSection>
      <DialogSection>
        <TextField
          label="Personal note"
          multiline
          value={draft.note}
          placeholder="I looked at your product and wanted to share what stood out…"
          onChange={(note) => update({ note })}
          hint="Optional. Appears in the “How we can help” section."
        />
      </DialogSection>
    </Dialog>
  );
}
