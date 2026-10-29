/**
 * The design tokens (styles/tokens.css, light theme) as PDF colours, so the
 * client report matches the panel. Keep the two in sync.
 */

import { rgb, type RGB } from 'pdf-lib';

function hex(value: string): RGB {
  const n = parseInt(value.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export const COLORS = {
  canvas: hex('#f6f6f6'),
  surface: hex('#ffffff'),
  sunken: hex('#f1f1f1'),
  border: hex('#e6e6e6'),
  text: hex('#171717'),
  textSecondary: hex('#6b6b6b'),
  textTertiary: hex('#a3a3a3'),
  accent: hex('#e600da'),
  accentText: hex('#c400b9'),
  accentSoft: hex('#fdeafc'),
  danger: hex('#e5484d'),
  dangerSoft: hex('#fdeeee'),
  warning: hex('#c98207'),
  warningSoft: hex('#fdf4e3'),
  success: hex('#2a9d3e'),
  successSoft: hex('#e8f8eb'),
  white: hex('#ffffff'),
};

export const TYPE = {
  display: 26,
  headline: 17,
  title: 13,
  body: 9.5,
  small: 8.5,
  tiny: 7.5,
};

/** A4 portrait, in points. */
export const PAGE = { width: 595.28, height: 841.89, margin: 40, footer: 28 };
