/**
 * Inspect mode: outlines the element under the pointer and, on click, picks
 * it instead of letting the page handle the click. Escape leaves the mode.
 */

import { isElement } from './dom';
import { Overlay, pageRect } from './overlay';

export interface InspectModeHandlers {
  onPick: (el: Element) => void;
  onExit: () => void;
}

export class InspectMode {
  private active = false;
  private readonly overlay: Overlay;

  constructor(
    private readonly doc: Document,
    private readonly handlers: InspectModeHandlers,
  ) {
    this.overlay = new Overlay(doc);
  }

  get isActive(): boolean {
    return this.active;
  }

  set(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    if (on) {
      this.doc.addEventListener('mousemove', this.onMove, true);
      this.doc.addEventListener('click', this.onClick, true);
      this.doc.addEventListener('keydown', this.onKey, true);
    } else {
      this.doc.removeEventListener('mousemove', this.onMove, true);
      this.doc.removeEventListener('click', this.onClick, true);
      this.doc.removeEventListener('keydown', this.onKey, true);
      this.overlay.clear();
    }
  }

  private targetAt(event: MouseEvent): Element | null {
    // composedPath()[0] reaches into open shadow roots.
    const target = event.composedPath()[0];
    return isElement(target) && !this.overlay.owns(target) ? target : null;
  }

  private readonly onMove = (event: MouseEvent) => {
    const el = this.targetAt(event);
    if (!el) return;
    const rect = pageRect(el);
    const label = `${el.tagName.toLowerCase()}  ${Math.round(rect.w)}×${Math.round(rect.h)}`;
    this.overlay.draw([{ rect, label }]);
  };

  private readonly onClick = (event: MouseEvent) => {
    const el = this.targetAt(event);
    if (!el) return;
    event.preventDefault();
    event.stopPropagation();
    this.handlers.onPick(el);
  };

  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    this.set(false);
    this.handlers.onExit();
  };
}
