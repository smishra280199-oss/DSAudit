import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Toast } from './ui';
import { CaptureGate } from './components/CaptureGate';
import { Header } from './components/Header';
import { ReportDetailsDialog } from './components/ReportDetailsDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { TabBar, TABS } from './components/TabBar';
import { NavigationContext, type FoundationSegment, type Navigation, type ReportVersion, type ViewKey } from './navigation';
import { useAuditState, useController } from './use-audit';
import { ComponentsView } from './views/ComponentsView';
import { FoundationsView } from './views/FoundationsView';
import { PagesView } from './views/PagesView';
import { InspectView } from './views/InspectView';
import { OpportunitiesView } from './views/OpportunitiesView';
import { OverviewView } from './views/OverviewView';
import { ReportView } from './views/ReportView';

const VIEWS: Record<ViewKey, { render: () => ReactNode; needsAudit: boolean }> = {
  overview: { render: () => <OverviewView />, needsAudit: true },
  foundations: { render: () => <FoundationsView />, needsAudit: true },
  components: { render: () => <ComponentsView />, needsAudit: true },
  opportunities: { render: () => <OpportunitiesView />, needsAudit: true },
  report: { render: () => <ReportView />, needsAudit: true },
  inspect: { render: () => <InspectView />, needsAudit: false },
  pages: { render: () => <PagesView />, needsAudit: false },
};

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

export function App() {
  const controller = useController();
  const { ready, toast } = useAuditState();
  const [view, setView] = useState<ViewKey>('overview');
  const [foundation, setFoundation] = useState<FoundationSegment>('color');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [focusedOpportunity, setFocusedOpportunity] = useState<string | null>(null);
  const [reportVersion, setReportVersion] = useState<ReportVersion>('executive');

  const go = useCallback((next: ViewKey, nextFoundation?: FoundationSegment) => {
    setView(next);
    if (nextFoundation) setFoundation(nextFoundation);
  }, []);

  const navigation = useMemo<Navigation>(
    () => ({
      view,
      foundation,
      go,
      focusedOpportunity,
      openOpportunity: (id: string) => {
        setFocusedOpportunity(id);
        setView('opportunities');
      },
      reportVersion,
      openReport: (version: ReportVersion) => {
        setReportVersion(version);
        setView('report');
      },
      openSettings: () => setSettingsOpen(true),
      openReportDetails: () => setDetailsOpen(true),
    }),
    [view, foundation, go, focusedOpportunity, reportVersion],
  );

  // Panel shortcuts: C capture, I inspect, 1–7 switch views.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target) || settingsOpen || detailsOpen) return;
      const key = event.key.toLowerCase();
      if (key === 'c') void controller.capture();
      else if (key === 'i') {
        setView('inspect');
        void controller.setInspectMode(!controller.getState().inspect.active);
      } else if (/^[1-7]$/.test(key)) setView(TABS[Number(key) - 1]!.view);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller, settingsOpen, detailsOpen]);

  // Leaving Inspect turns Inspect mode off so the page behaves normally again.
  useEffect(() => {
    if (view === 'inspect') return;
    if (controller.getState().inspect.active) void controller.setInspectMode(false);
    void controller.clearHighlights();
  }, [view, controller]);

  if (!ready) return null;
  const current = VIEWS[view];

  return (
    <NavigationContext.Provider value={navigation}>
      <div className="panel">
        <Header />
        <main className="panel__content" id="main">
          {current.needsAudit ? <CaptureGate>{current.render()}</CaptureGate> : current.render()}
        </main>
        <TabBar />
        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <ReportDetailsDialog open={detailsOpen} onClose={() => setDetailsOpen(false)} />
        {toast && <Toast message={toast} />}
      </div>
    </NavigationContext.Provider>
  );
}
