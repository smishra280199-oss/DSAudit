/**
 * Report charts, drawn with the layout engine. One neutral series (dark ink
 * on the grey track, like the reference slider), bars that start at zero,
 * sorted by value, direct value labels at the bar end, and status shown as a
 * dot beside its text label so colour is never the only signal.
 */

import type { RGB } from 'pdf-lib';
import type { Layout } from './layout';
import { COLORS, TYPE } from './theme';

export interface BarRow {
  label: string;
  value: number;
  /** Text printed at the end of the bar, e.g. "$3,400". */
  valueLabel: string;
  /** Optional status dot before the label. */
  dot?: RGB;
}

const ROW = 19;
const BAR = 7;

/**
 * Horizontal bar chart. `max` fixes the scale (e.g. 100 for scores);
 * `marker` draws a labelled reference line at that value.
 */
export function barChart(
  l: Layout,
  x: number,
  top: number,
  width: number,
  rows: BarRow[],
  options: { max?: number; labelWidth?: number; marker?: { value: number; label: string } } = {},
): number {
  const labelWidth = options.labelWidth ?? 92;
  const valueWidth = 46;
  const trackX = x + labelWidth;
  const trackW = width - labelWidth - valueWidth;
  const max = options.max ?? Math.max(1, ...rows.map((r) => r.value));
  let y = top;

  if (options.marker) {
    const mx = trackX + (options.marker.value / max) * trackW;
    l.text(options.marker.label, mx - l.textWidth(options.marker.label, { size: TYPE.tiny }) / 2, y, { size: TYPE.tiny, color: COLORS.textTertiary });
    y += 12;
    const bottom = y + rows.length * ROW - 6;
    for (let d = y; d < bottom; d += 4) l.roundedRect(mx - 0.4, d, 0.8, 2, 0, COLORS.textTertiary);
  }

  for (const row of rows) {
    let lx = x;
    if (row.dot) lx += l.status('', row.dot, x, y + 1) + 1;
    l.text(row.label, lx, y, { size: TYPE.small, color: COLORS.text }, labelWidth - (lx - x) - 6);
    l.roundedRect(trackX, y + 1.5, trackW, BAR, BAR / 2, COLORS.sunken);
    const w = Math.max(BAR, (Math.min(row.value, max) / max) * trackW);
    if (row.value > 0) l.roundedRect(trackX, y + 1.5, w, BAR, BAR / 2, COLORS.text);
    l.textRight(row.valueLabel, x + width, y, { size: TYPE.small, color: COLORS.textSecondary });
    y += ROW;
  }
  return y - top - (ROW - BAR - 4);
}

/**
 * Before/after bars: the full bar is today's count (light), the dark part
 * is what remains after the cleanup. Labelled "27 → 17".
 */
export function beforeAfterChart(l: Layout, x: number, top: number, width: number, rows: { label: string; today: number; after: number }[]): number {
  const labelWidth = 110;
  const valueWidth = 54;
  const trackX = x + labelWidth;
  const trackW = width - labelWidth - valueWidth;
  const max = Math.max(1, ...rows.map((r) => r.today));
  let y = top;

  // Legend: two swatches with text, so the encoding never relies on colour alone.
  const legend = { size: TYPE.tiny, color: COLORS.textSecondary };
  l.roundedRect(x, y + 1, 8, 8, 2, COLORS.text);
  l.text('After cleanup', x + 12, y, legend, 120);
  const second = x + 12 + l.textWidth('After cleanup', legend) + 14;
  l.roundedRect(second, y + 1, 8, 8, 2, COLORS.border);
  l.text('Removed by the cleanup', second + 12, y, legend, 160);
  y += 18;

  for (const row of rows) {
    l.text(row.label, x, y, { size: TYPE.small, color: COLORS.text }, labelWidth - 6);
    const todayW = (row.today / max) * trackW;
    const afterW = Math.max(BAR, (row.after / max) * trackW);
    l.roundedRect(trackX, y + 1.5, Math.max(todayW, BAR), BAR, BAR / 2, COLORS.border);
    if (row.after > 0) l.roundedRect(trackX, y + 1.5, afterW, BAR, BAR / 2, COLORS.text);
    l.textRight(`${row.today} → ${row.after}`, x + width, y, { size: TYPE.small, color: COLORS.textSecondary });
    y += ROW;
  }
  return y - top - (ROW - BAR - 4);
}
