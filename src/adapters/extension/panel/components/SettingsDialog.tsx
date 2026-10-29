import { useEffect, useState } from 'react';
import { DEFAULT_ASSUMPTIONS, formatMoney, type SavingsAssumptions } from '../../../../savings';
import { Button, Dialog, DialogSection, Slider, Toggle } from '../ui';
import { useAuditState, useController } from '../use-audit';

const CONTRIBUTORS = [2, 4, 8, 16, 32, 64];
const RATES = [40, 60, 85, 120, 160, 200];
const VALUE_HOURS = [0.25, 0.5, 1, 2];
const VARIANT_HOURS = [1, 2, 4, 8];
const RETHEMES = [0, 1, 2, 4];
const CONSERVATIVE_REALISATION = 0.4;
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Edits the savings assumptions, in the reference's settings-dialog style: stepped sliders and a toggle. */
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const controller = useController();
  const { assumptions } = useAuditState();
  const [draft, setDraft] = useState<SavingsAssumptions>(assumptions ?? DEFAULT_ASSUMPTIONS);

  useEffect(() => {
    if (open && assumptions) setDraft(assumptions);
  }, [open, assumptions]);

  const update = (patch: Partial<SavingsAssumptions>) => setDraft((d) => ({ ...d, ...patch }));
  const save = () => {
    void controller.updateAssumptions(draft);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Savings assumptions"
      subtitle="Planning estimates. Tune them to your team."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <DialogSection>
        <Slider
          label="UI contributors"
          description="Designers and engineers who regularly build or change UI."
          steps={CONTRIBUTORS}
          value={draft.contributors}
          onChange={(contributors) => update({ contributors })}
        />
      </DialogSection>
      <DialogSection>
        <Slider
          label="Hourly rate"
          steps={RATES}
          value={draft.hourlyRate}
          format={(n) => formatMoney(n, draft.currency)}
          onChange={(hourlyRate) => update({ hourlyRate })}
        />
      </DialogSection>
      <DialogSection>
        <Slider
          label="Hours lost per redundant value"
          description="Per contributor per year: choosing between near-identical values, review, drift fixes."
          steps={VALUE_HOURS}
          value={draft.hoursPerExcessValue}
          format={(n) => `${n}h`}
          onChange={(hoursPerExcessValue) => update({ hoursPerExcessValue })}
        />
      </DialogSection>
      <DialogSection>
        <Slider
          label="Hours lost per redundant component variant"
          steps={VARIANT_HOURS}
          value={draft.hoursPerExcessVariant}
          format={(n) => `${n}h`}
          onChange={(hoursPerExcessVariant) => update({ hoursPerExcessVariant })}
        />
      </DialogSection>
      <DialogSection>
        <Slider
          label="Re-themes per year"
          description="Each costs a few minutes per hard-coded value."
          steps={RETHEMES}
          value={draft.rethemesPerYear}
          onChange={(rethemesPerYear) => update({ rethemesPerYear })}
        />
      </DialogSection>
      <DialogSection>
        <Toggle
          label="Conservative estimate"
          description={`Count ${pct(CONSERVATIVE_REALISATION)} of the yearly drag as recoverable instead of ${pct(DEFAULT_ASSUMPTIONS.realisationRate)}.`}
          checked={draft.realisationRate <= CONSERVATIVE_REALISATION}
          onChange={(on) => update({ realisationRate: on ? CONSERVATIVE_REALISATION : DEFAULT_ASSUMPTIONS.realisationRate })}
        />
      </DialogSection>
    </Dialog>
  );
}
