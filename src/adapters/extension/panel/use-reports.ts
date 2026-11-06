import { useState } from 'react';
import type { Audit } from '../../../audit';
import { copyFindingCard, copyMarkdown, exportFindingCard, exportHtml, exportJson, exportPdf, exportTeaserPdf } from './export';
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

  const run = async (task: () => Promise<boolean | void>, done: string, failed: string) => {
    setGenerating(true);
    try {
      const ok = await task();
      controller.notify(ok === false ? failed : done);
    } catch {
      controller.notify(failed);
    } finally {
      setGenerating(false);
    }
  };

  return {
    generating,
    downloadPdf,
    downloadTeaser: (audit: Audit) => run(() => exportTeaserPdf(audit, controller.reportOptions()), 'Short version downloaded. Attach it to your first email.', 'The PDF couldn’t be generated.'),
    downloadCard: (audit: Audit) => run(() => exportFindingCard(audit, controller.reportOptions()), 'Top finding saved as an image.', 'No finding to show yet.'),
    copyCard: (audit: Audit) => run(() => copyFindingCard(audit, controller.reportOptions()), 'Image copied. Paste it into your email or LinkedIn message.', 'Couldn’t copy the image.'),
    downloadHtml: (audit: Audit) => exportHtml(audit, controller.reportOptions()),
    downloadJson: (audit: Audit) => exportJson(audit),
    copySummary: (audit: Audit) =>
      void copyMarkdown(audit, controller.reportOptions()).then((ok) => controller.notify(ok ? 'Summary copied.' : 'Couldn’t copy to the clipboard.')),
  };
}
