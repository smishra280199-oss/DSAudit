/**
 * A small top-down layout engine over pdf-lib: pages with the canvas
 * background, a cursor that flows down the page and breaks to a new page,
 * text wrapping, cards, chips, status dots and swatches. Coordinates passed in are
 * measured from the top of the page, as in CSS.
 */

import type { PDFDocument, PDFFont, PDFPage, RGB } from 'pdf-lib';
import { COLORS, PAGE } from './theme';

export interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

export interface TextStyle {
  size: number;
  font?: 'regular' | 'bold';
  color?: RGB;
  lineHeight?: number;
}

/** Characters outside WinAnsi (the standard PDF fonts' encoding), mapped to safe equivalents. */
const REPLACEMENTS: Record<string, string> = {
  '→': 'to',
  '≈': '~',
  '≤': '<=',
  '≥': '>=',
  'Δ': 'd',
  '−': '-',
  '✓': 'v',
  ' ': ' ',
};

export function pdfSafe(text: string): string {
  return [...text]
    .map((ch) => {
      if (REPLACEMENTS[ch] !== undefined) return REPLACEMENTS[ch];
      const code = ch.codePointAt(0)!;
      return code < 0x100 || '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.includes(ch) ? ch : '';
    })
    .join('');
}

export class Layout {
  readonly pages: PDFPage[] = [];
  page!: PDFPage;
  /** While true, nothing is drawn: used by measure() to size cards before drawing them. */
  private dry = false;
  /** Cursor: distance from the top of the current page. */
  y = PAGE.margin;
  readonly left = PAGE.margin;
  readonly width = PAGE.width - PAGE.margin * 2;

  constructor(
    readonly pdf: PDFDocument,
    readonly fonts: Fonts,
  ) {
    this.addPage();
  }

  addPage(): void {
    this.page = this.pdf.addPage([PAGE.width, PAGE.height]);
    this.page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: COLORS.canvas });
    this.pages.push(this.page);
    this.y = PAGE.margin;
  }

  /** The height `draw` would take, without drawing anything. `draw` returns the height it used. */
  measure(draw: () => number): number {
    const [dry, y] = [this.dry, this.y];
    this.dry = true;
    try {
      return draw();
    } finally {
      this.dry = dry;
      this.y = y;
    }
  }

  /** Starts a new page unless `height` still fits above the footer. */
  ensure(height: number): void {
    if (this.y + height > PAGE.height - PAGE.margin - PAGE.footer) this.addPage();
  }

  gap(height: number): void {
    this.y += height;
  }

  font(style: TextStyle): PDFFont {
    return style.font === 'bold' ? this.fonts.bold : this.fonts.regular;
  }

  textWidth(text: string, style: TextStyle): number {
    return this.font(style).widthOfTextAtSize(pdfSafe(text), style.size);
  }

  /** Greedy word wrap; very long words are broken by character. */
  wrap(text: string, style: TextStyle, maxWidth: number): string[] {
    const font = this.font(style);
    const fits = (s: string) => font.widthOfTextAtSize(s, style.size) <= maxWidth;
    const lines: string[] = [];
    for (const paragraph of pdfSafe(text).split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (fits(candidate)) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        line = word;
        while (!fits(line) && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && !fits(line.slice(0, cut))) cut -= 1;
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      }
      lines.push(line);
    }
    return lines;
  }

  lineHeight(style: TextStyle): number {
    return style.lineHeight ?? style.size * 1.35;
  }

  textHeight(text: string, style: TextStyle, maxWidth: number): number {
    return this.wrap(text, style, maxWidth).length * this.lineHeight(style);
  }

  /** Draws wrapped text with its top at `top`; returns the height used. */
  text(text: string, x: number, top: number, style: TextStyle, maxWidth = this.width): number {
    const lines = this.wrap(text, style, maxWidth);
    const lh = this.lineHeight(style);
    if (this.dry) return lines.length * lh;
    lines.forEach((line, i) => {
      this.page.drawText(line, {
        x,
        y: PAGE.height - top - style.size * 0.82 - i * lh - (lh - style.size * 1.2) / 2,
        size: style.size,
        font: this.font(style),
        color: style.color ?? COLORS.text,
      });
    });
    return lines.length * lh;
  }

  /** Single-line text whose right edge sits at `right`. */
  textRight(text: string, right: number, top: number, style: TextStyle): void {
    this.text(text, right - this.textWidth(text, style), top, style, Number.MAX_SAFE_INTEGER);
  }

  roundedRect(x: number, top: number, width: number, height: number, radius: number, fill: RGB, stroke?: RGB): void {
    if (this.dry) return;
    const r = Math.min(radius, width / 2, height / 2);
    const w = width;
    const h = height;
    const path = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    this.page.drawSvgPath(path, {
      x,
      y: PAGE.height - top,
      color: fill,
      ...(stroke ? { borderColor: stroke, borderWidth: 0.75 } : {}),
    });
  }

  /** A white card with a hairline border, as in the panel. */
  card(x: number, top: number, width: number, height: number): void {
    this.roundedRect(x, top, width, height, 10, COLORS.surface, COLORS.border);
  }

  /** A grey chip with a hairline border, like the reference's “App” tag; returns its width. */
  chip(text: string, x: number, top: number, size = 7.5): number {
    const style: TextStyle = { size, color: COLORS.textSecondary };
    const width = this.textWidth(text, style) + 10;
    this.roundedRect(x, top, width, size + 7, 4, COLORS.sunken, COLORS.border);
    this.text(text, x + 5, top + 3.5, style, Number.MAX_SAFE_INTEGER);
    return width;
  }

  /** A status dot followed by its label, like the reference's “● Production”; returns its width. */
  status(label: string, color: RGB, x: number, top: number, size = 8): number {
    if (!this.dry) this.page.drawCircle({ x: x + 2.5, y: PAGE.height - top - size * 0.55, size: 2.5, color });
    this.text(label, x + 9, top, { size, color: COLORS.textSecondary }, Number.MAX_SAFE_INTEGER);
    return 9 + this.textWidth(label, { size });
  }

  /** A colour sample. */
  swatch(color: RGB, x: number, top: number, size: number): void {
    this.roundedRect(x, top, size, size, 4, color, COLORS.border);
  }

  rule(top: number, x = this.left + 14, width = this.width - 28): void {
    if (this.dry) return;
    this.page.drawLine({
      start: { x, y: PAGE.height - top },
      end: { x: x + width, y: PAGE.height - top },
      thickness: 0.5,
      color: COLORS.border,
    });
  }
}
