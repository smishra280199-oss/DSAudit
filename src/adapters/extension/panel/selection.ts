/**
 * Multi-select over a list that can change underneath it (pages added,
 * removed or reordered elsewhere). Pure, so the rules are tested directly;
 * PagesView keeps the selected ids in React state.
 */

export type SelectAllState = 'none' | 'some' | 'all';

/** The selected ids that are still in the list, in list order. */
export function liveSelection(selected: ReadonlySet<string>, ids: readonly string[]): string[] {
  return ids.filter((id) => selected.has(id));
}

/** What the master checkbox shows: unchecked, a dash, or checked. */
export function selectAllState(selected: ReadonlySet<string>, ids: readonly string[]): SelectAllState {
  const n = liveSelection(selected, ids).length;
  return n === 0 ? 'none' : n === ids.length ? 'all' : 'some';
}

/** The master checkbox: anything less than all selects all; all clears. */
export function toggleAll(selected: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  return selectAllState(selected, ids) === 'all' ? new Set() : new Set(ids);
}

export function toggleOne(selected: ReadonlySet<string>, id: string, on: boolean): Set<string> {
  const next = new Set(selected);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}
