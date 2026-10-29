import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Toast } from './ui';
import { CaptureGate } from './components/CaptureGate';
import { Header } from './components/Header';
import { SettingsDialog } from './components/SettingsDialog';
import { TabBar, TABS } from './components/TabBar';
import { NavigationContext, type FoundationSegment, type Navigation, type ViewKey } from './navigation';
import { useAuditState, useController } from './use-audit';
import { ComponentsView } from './views/ComponentsView';
import { FoundationsView } from './views/FoundationsView';
import { HistoryView } from './views/HistoryView';
import { InspectView } from './views/InspectView';
import { OpportunitiesView } from './views/OpportunitiesView';
import { OverviewView } from './views/OverviewView';

const VIEWS: Record<ViewKey, { render: () => ReactNode; needsAudit: boolean }> = {
  overview: { render: () => <OverviewView />, needsAudit: true },
  foundations: { render: () => <FoundationsView />, needsAudit: true },
  components: { render: () => <ComponentsView />, needsAudit: true },
  opportunities: { render: () => <OpportunitiesView />, needsAudit: true },
  inspect: { render: () => <InspectView />, needsAudit: false },
  history: { render: () => <HistoryView />, needsAudit: false },
};

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

export function App() {
  const controller = useController();
  const { ready, toast, audit, dismissed } = useAuditState();
  const [view, setView] = useState<ViewKey>('overview');
  const [foundation, setFoundation] = useState<FoundationSegment>('color');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const go = useCallback((next: ViewKey, nextFoundation?: FoundationSegment) => {
    setView(next);
    if (nextFoundation) setFoundation(nextFoundation);
  }, []);

  const navigation = useMemo<Navigation>(
    () => ({ view, foundation, go, openSettings: () => setSettingsOpen(true) }),
    [view, foundation, go],
  );

  // Panel shortcuts: C capture, I inspect, 1–6 switch views.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target) || settingsOpen) return;
      const key = event.key.toLowerCase();
      if (key === 'c') void controller.capture();
      else if (key === 'i') {
        setView('inspect');
        void controller.setInspectMode(!controller.getState().inspect.active);
      } else if (/^[1-6]$/.test(key)) setView(TABS[Number(key) - 1]!.view);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller, settingsOpen]);

  // Leaving Inspect turns Inspect mode off so the page behaves normally again.
  useEffect(() => {
    if (view === 'inspect') return;
    if (controller.getState().inspect.active) void controller.setInspectMode(false);
    void controller.clearHighlights();
  }, [view, controller]);

  if (!ready) return null;
  const current = VIEWS[view];
  const openOpportunities = audit ? audit.analysis.opportunities.filter((o) => !dismissed.includes(o.id)).length : 0;

  return (
    <NavigationContext.Provider value={navigation}>
      <div className="panel">
        <Header />
        <main className="panel__content" id="main">
          {current.needsAudit ? <CaptureGate>{current.render()}</CaptureGate> : current.render()}
        </main>
        <TabBar badge={{ opportunities: openOpportunities }} />
        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        {toast && <Toast message={toast} />}
      </div>
    </NavigationContext.Provider>
  );
}
