import type { FocusRect } from './spatial';

export interface Focusable {
  el: HTMLElement;
  rect: FocusRect;
}

const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="option"]',
  '[tabindex]:not([tabindex="-1"])',
  '[data-gp]',
  'label[for]',
  'summary',
].join(',');

function isVisible(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false;
  if (el.getAttribute('data-gp-skip') === 'true') return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return false;
  if (parseFloat(style.opacity || '1') < 0.05) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return false;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (rect.bottom < -40 || rect.top > vh + 40 || rect.right < -40 || rect.left > vw + 40) return false;
  return true;
}

function effectiveZIndex(el: HTMLElement): number {
  let node: HTMLElement | null = el;
  let z = 0;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if (style.position !== 'static') {
      const v = parseInt(style.zIndex, 10);
      if (!Number.isNaN(v)) { z = Math.max(z, v); }
    }
    node = node.parentElement;
  }
  return z;
}

function topLayerRoot(): HTMLElement | null {
  const dialogs = Array.from(
    document.querySelectorAll<HTMLElement>('[data-gp-layer],[role="dialog"],[aria-modal="true"]'),
  ).filter(isVisible);
  if (dialogs.length === 0) return null;
  let top: HTMLElement | null = null;
  let topZ = -Infinity;
  for (const d of dialogs) {
    const z = effectiveZIndex(d);
    if (z >= topZ) { topZ = z; top = d; }
  }
  return top;
}

export function collectFocusables(): Focusable[] {
  const layer = topLayerRoot();
  const scope: ParentNode = layer ?? document;
  const nodes = Array.from(scope.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR));
  const seen = new Set<HTMLElement>();
  const out: Focusable[] = [];
  for (const el of nodes) {
    if (seen.has(el)) continue;
    if (el.closest('[data-gp-skip="true"]')) continue;
    if (!isVisible(el)) continue;
    const parentFocusable = el.parentElement?.closest('[data-gp]');
    if (parentFocusable && parentFocusable !== el && !el.hasAttribute('data-gp')) {
      continue;
    }
    seen.add(el);
    const r = el.getBoundingClientRect();
    out.push({ el, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } });
  }
  return out;
}

export function isElementInViewport(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
}
