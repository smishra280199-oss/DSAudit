import type { ReactNode } from 'react';
import { ComponentsIcon, CursorIcon, FileIcon, GaugeIcon, PagesIcon, SparkleIcon, SwatchIcon, Tooltip } from '../ui';
import { useNavigation, VIEW_TITLES, type ViewKey } from '../navigation';

export const TABS: { view: ViewKey; icon: ReactNode }[] = [
  { view: 'overview', icon: <GaugeIcon size={18} /> },
  { view: 'foundations', icon: <SwatchIcon size={18} /> },
  { view: 'components', icon: <ComponentsIcon size={18} /> },
  { view: 'opportunities', icon: <SparkleIcon size={18} /> },
  { view: 'report', icon: <FileIcon size={18} /> },
  { view: 'inspect', icon: <CursorIcon size={18} /> },
  { view: 'pages', icon: <PagesIcon size={18} /> },
];

/** Bottom icon bar, as in the reference's narrow layouts. Keys 1–7 switch tabs. */
export function TabBar() {
  const { view, go } = useNavigation();
  return (
    <nav className="tabbar" aria-label="Views">
      {TABS.map((tab, i) => (
        <Tooltip key={tab.view} content={VIEW_TITLES[tab.view]} shortcut={[String(i + 1)]} placement="top">
          <button
            type="button"
            className="tabbar__item"
            aria-label={VIEW_TITLES[tab.view]}
            aria-current={view === tab.view ? 'page' : undefined}
            onClick={() => go(tab.view)}
          >
            {tab.icon}
          </button>
        </Tooltip>
      ))}
    </nav>
  );
}
