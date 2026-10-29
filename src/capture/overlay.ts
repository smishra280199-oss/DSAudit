/**
 * Page overlays drawn by the extension: highlight boxes for elements the
 * panel points at, and the hover outline used by Inspect mode. Everything
 * lives in one closed shadow root so page styles can't leak in or out.
 */

const HOST_ID = '__dslint-overlay';
const ACCENT = '#e600dc';

const STYLES = `
  :host { all: initial; }
  .layer { position: absolute; inset: 0 auto auto 0; pointer-events: none; z-index: 2147483647; }
  .box {
    position: absolute; box-sizing: border-box; border-radius: 4px;
    outline: 2px solid ${ACCENT}; outline-offset: 1px;
    background: color-mix(in srgb, ${ACCENT} 10%, transparent);
    transition: all 80ms ease-out;
  }
  .label {
    position: absolute; transform: translateY(calc(-100% - 6px));
    font: 500 11px/1 ui-sans-serif, system-ui, -apple-system, "Inter", sans-serif;
    color: #fafafa; white-space: nowrap; padding: 5px 7px; border-radius: 6px;
    background: linear-gradient(#3a3a3a, #262626);
    box-shadow: 0 1px 0 rgba(255,255,255,.08) inset, 0 4px 12px rgba(0,0,0,.25);
  }
`;

export interface OverlayBox {
  rect: { x: number; y: number; w: number; h: number };
  label?: string;
}

export class Overlay {
  private host: HTMLElement | null = null;
  private layer: HTMLElement | null = null;

  constructor(private readonly doc: Document) {}

  private ensureLayer(): HTMLElement {
    if (this.layer && this.host?.isConnected) return this.layer;
    this.doc.getElementById(HOST_ID)?.remove();
    this.host = this.doc.createElement('div');
    this.host.id = HOST_ID;
    const shadow = this.host.attachShadow({ mode: 'closed' });
    const style = this.doc.createElement('style');
    style.textContent = STYLES;
    this.layer = this.doc.createElement('div');
    this.layer.className = 'layer';
    shadow.append(style, this.layer);
    this.doc.documentElement.append(this.host);
    return this.layer;
  }

  /** Replaces all boxes. Rects are in document (page) coordinates. */
  draw(boxes: OverlayBox[]): void {
    const layer = this.ensureLayer();
    layer.replaceChildren(
      ...boxes.flatMap(({ rect, label }) => {
        const box = this.doc.createElement('div');
        box.className = 'box';
        Object.assign(box.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
        if (!label) return [box];
        const tag = this.doc.createElement('div');
        tag.className = 'label';
        tag.textContent = label;
        Object.assign(tag.style, { left: `${rect.x}px`, top: `${rect.y}px` });
        return [box, tag];
      }),
    );
  }

  clear(): void {
    this.host?.remove();
    this.host = null;
    this.layer = null;
  }

  owns(node: Node | null): boolean {
    return node !== null && node === this.host;
  }
}

export function pageRect(el: Element): OverlayBox['rect'] {
  const win = el.ownerDocument.defaultView!;
  const r = el.getBoundingClientRect();
  return { x: r.left + win.scrollX, y: r.top + win.scrollY, w: r.width, h: r.height };
}
