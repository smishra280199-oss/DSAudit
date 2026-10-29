/**
 * How much to trust an audit. Every reason here is something the capture
 * could not see; the panel lists them next to the score.
 */

import type { PageSnapshot } from '../shared/snapshot';
import type { Confidence } from './types';

export function assessConfidence(snapshot: PageSnapshot): Confidence {
  const reasons: string[] = [];
  let penalty = 0;
  const { rendered, authored } = snapshot;

  if (!snapshot.hostAccess) {
    reasons.push('Site access wasn’t granted, so cross-origin stylesheets were skipped.');
    penalty += 1;
  }
  if (authored.unreadableSheets.length > 0) {
    const n = authored.unreadableSheets.length;
    reasons.push(`${n} stylesheet${n === 1 ? '' : 's'} couldn’t be read (they need cookies or failed to load).`);
    penalty += n >= 3 ? 2 : 1;
  }
  if (authored.sheets.length === 0) {
    reasons.push('No readable stylesheets: token and state findings are based on the rendered page only.');
    penalty += 2;
  }
  if (rendered.truncated) {
    reasons.push('The page has more than 5,000 visible elements; the rest weren’t measured.');
    penalty += 1;
  }
  if (authored.truncated) {
    reasons.push('Very large CSS: only the first 25,000 design declarations were recorded.');
    penalty += 1;
  }
  if (rendered.elements.length < 30) {
    reasons.push('Very few elements were visible, so scores rest on little evidence.');
    penalty += 1;
  }

  return { level: penalty === 0 ? 'high' : penalty <= 2 ? 'medium' : 'low', reasons };
}
