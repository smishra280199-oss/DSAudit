import { useState } from 'react';
import type { Audit } from '../../../audit';
import { copyMarkdown, exportHtml, exportJson, exportPdf } from './export';
import { useController } from './use-audit';

/**
 * Report actions shared by the header menu, the overview and history, with
 * progress and toasts handled in one place.
 */
export function useReports() {
  const controller = useController();
  const [generating, setGenerating] = useState(false);

  const downloadPdf = async (audit: Audit) => {
    setGenerating(true);
    try {
      await exportPdf(audit, controller.reportOptions());
      controller.notify('PDF report downloaded.');
    } catch {
      controller.notify('The PDF couldn’t be generated.');
    } finally {
      setGenerating(false);
    }
  };

  return {
    generating,
    downloadPdf,
    downloadHtml: (audit: Audit) => exportHtml(audit, controller.reportOptions()),
    downloadJson: (audit: Audit) => exportJson(audit),
    copySummary: (audit: Audit) =>
      void copyMarkdown(audit, controller.reportOptions()).then((ok) => controller.notify(ok ? 'Summary copied.' : 'Couldn’t copy to the clipboard.')),
  };
}
