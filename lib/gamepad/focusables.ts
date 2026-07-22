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
  '[role="menuitemradio"]',
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
  if (el.getAttribute('data-gp') === 'false') return false;
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
      if (!Number.isNaN(v)) z = Math.max(z, v);
    }
    node = node.parentElement;
  }
  return z;
}

function isModalContainer(el: HTMLElement): boolean {
  if (el.hasAttribute('data-gp-layer') || el.getAttribute('role') === 'dialog' || el.getAttribute('aria-modal') === 'true') {
    return true;
  }
  const style = window.getComputedStyle(el);
  if (style.position !== 'fixed' && style.position !== 'absolute') return false;
  const r = el.getBoundingClientRect();
  const coverage = (r.width * r.height) / (window.innerWidth * window.innerHeight);
  return coverage >= 0.5 && style.position === 'fixed';
}

function scopeOf(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    if (isModalContainer(node)) return node;
    node = node.parentElement;
  }
  return null;
}

export function getActiveScope(): HTMLElement | null {
  const explicit = Array.from(
    document.querySelectorAll<HTMLElement>('[data-gp-layer],[role="dialog"],[aria-modal="true"]'),
  ).filter(isVisible);
  let top: HTMLElement | null = null;
  let topZ = -Infinity;
  for (const el of explicit) {
    const z = effectiveZIndex(el);
    if (z >= topZ) { topZ = z; top = el; }
  }
  return top;
}

export function getTopModalScope(): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR));
  let topScope: HTMLElement | null = null;
  let topZ = -Infinity;
  for (const el of nodes) {
    if (!isVisible(el)) continue;
    const scope = scopeOf(el);
    if (!scope) continue;
    const z = effectiveZIndex(scope);
    if (z >= topZ) { topZ = z; topScope = scope; }
  }
  return topScope;
}

export function collectFocusables(): Focusable[] {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR));
  const raw: Array<{ el: HTMLElement; scope: HTMLElement | null }> = [];
  const seen = new Set<HTMLElement>();
  for (const el of nodes) {
    if (seen.has(el)) continue;
    if (el.closest('[data-gp-skip="true"]')) continue;
    if (!isVisible(el)) continue;
    const parentFocusable = el.parentElement?.closest('[data-gp]');
    if (parentFocusable && parentFocusable !== el && !el.hasAttribute('data-gp')) continue;
    seen.add(el);
    raw.push({ el, scope: scopeOf(el) });
  }

  let topScope: HTMLElement | null = null;
  let topZ = -Infinity;
  for (const item of raw) {
    if (!item.scope) continue;
    const z = effectiveZIndex(item.scope);
    if (z >= topZ) { topZ = z; topScope = item.scope; }
  }

  const kept = topScope ? raw.filter((i) => topScope!.contains(i.el)) : raw;

  return kept.map(({ el }) => {
    const r = el.getBoundingClientRect();
    return { el, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } };
  });
}

export function isElementInViewport(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
}
