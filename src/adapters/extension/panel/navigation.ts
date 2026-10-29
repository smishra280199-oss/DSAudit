import { createContext, useContext } from 'react';
import type { AreaKey, FoundationKey } from '../../../inference/types';

export type ViewKey = 'overview' | 'foundations' | 'components' | 'opportunities' | 'inspect' | 'history';

/** Foundations view segments: the six foundations plus tokens. */
export type FoundationSegment = FoundationKey | 'tokens';

export interface Navigation {
  view: ViewKey;
  foundation: FoundationSegment;
  go: (view: ViewKey, foundation?: FoundationSegment) => void;
  openSettings: () => void;
}

export const NavigationContext = createContext<Navigation | null>(null);

export function useNavigation(): Navigation {
  const nav = useContext(NavigationContext);
  if (!nav) throw new Error('useNavigation must be used inside <NavigationContext.Provider>.');
  return nav;
}

/** Where to go when an area is clicked on the overview. */
export function destinationFor(area: AreaKey): { view: ViewKey; foundation?: FoundationSegment } {
  switch (area) {
    case 'components':
      return { view: 'components' };
    case 'tokens':
      return { view: 'foundations', foundation: 'tokens' };
    case 'interaction':
    case 'accessibility':
      return { view: 'opportunities' };
    default:
      return { view: 'foundations', foundation: area };
  }
}

export const VIEW_TITLES: Record<ViewKey, string> = {
  overview: 'Overview',
  foundations: 'Foundations',
  components: 'Components',
  opportunities: 'Opportunities',
  inspect: 'Inspect',
  history: 'History',
};
