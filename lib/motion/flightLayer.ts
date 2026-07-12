import { gsap } from 'gsap';
import type { AnchorRect } from './boardRegistry';

const LAYER_ID = 'motion-flight-layer';
const MOBILE_MAX_CONCURRENT = 2;

let layerEl: HTMLDivElement | null = null;
const clonePool: HTMLDivElement[] = [];
let activeFlights = 0;

function getLayer(): HTMLDivElement {
  if (layerEl && document.body.contains(layerEl)) return layerEl;
  const el = document.createElement('div');
  el.id = LAYER_ID;
  el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:45;overflow:hidden;';
  document.body.appendChild(el);
  layerEl = el;
  return el;
}

function acquireClone(): HTMLDivElement {
  const clone = clonePool.pop() ?? document.createElement('div');
  if (!clone.firstChild) {
    const img = document.createElement('img');
    img.draggable = false;
    img.decoding = 'async';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    clone.appendChild(img);
  }
  clone.style.cssText = 'position:absolute;left:0;top:0;will-change:transform;backface-visibility:hidden;box-shadow:0 6px 24px rgba(0,0,0,0.55);';
  return clone;
}

function releaseClone(clone: HTMLDivElement): void {
  gsap.killTweensOf(clone);
  clone.remove();
  clone.style.cssText = '';
  if (clonePool.length < 6) clonePool.push(clone);
}

export function arcPoint(from: AnchorRect, to: AnchorRect, arcHeight: number, t: number): { x: number; y: number } {
  const x0 = from.left;
  const y0 = from.top;
  const x1 = to.left;
  const y1 = to.top;
  const cx = (x0 + x1) / 2;
  const cy = Math.min(y0, y1) - arcHeight;
  const u = 1 - t;
  return {
    x: u * u * x0 + 2 * u * t * cx + t * t * x1,
    y: u * u * y0 + 2 * u * t * cy + t * t * y1,
  };
}

export interface FlyCardOptions {
  fromRect: AnchorRect;
  toRect: AnchorRect;
  imageUrl: string | null;
  durationMs: number;
  arcHeight?: number;
  flipInFlight?: boolean;
  isMobile?: boolean;
  ease?: string;
}

export const CARD_BACK_URL = '/images/card-back.webp';

const defeatPlaceholders = new Map<string, { el: HTMLDivElement; timer: ReturnType<typeof setTimeout> }>();

export function spawnDefeatPlaceholder(instanceId: string, rect: AnchorRect, imageUrl: string | null): void {
  if (typeof document === 'undefined') return;
  consumeDefeatPlaceholder(instanceId);
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;pointer-events:none;z-index:44;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;border-radius:6px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.4);`;
  const img = document.createElement('img');
  img.src = imageUrl ?? CARD_BACK_URL;
  img.draggable = false;
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
  el.appendChild(img);
  document.body.appendChild(el);
  const timer = setTimeout(() => consumeDefeatPlaceholder(instanceId), 12_000);
  defeatPlaceholders.set(instanceId, { el, timer });
}

export function consumeDefeatPlaceholder(instanceId: string): AnchorRect | null {
  const entry = defeatPlaceholders.get(instanceId);
  if (!entry) return null;
  defeatPlaceholders.delete(instanceId);
  clearTimeout(entry.timer);
  const rect = entry.el.getBoundingClientRect();
  entry.el.remove();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export function flyCard(opts: FlyCardOptions): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || opts.durationMs <= 0) {
      resolve();
      return;
    }
    if (opts.isMobile && activeFlights >= MOBILE_MAX_CONCURRENT) {
      resolve();
      return;
    }

    const layer = getLayer();
    const clone = acquireClone();
    const img = clone.firstChild as HTMLImageElement;
    img.src = opts.flipInFlight ? CARD_BACK_URL : (opts.imageUrl ?? CARD_BACK_URL);
    img.style.transform = '';
    let flipped = false;

    const { fromRect, toRect } = opts;
    clone.style.width = `${fromRect.width}px`;
    clone.style.height = `${fromRect.height}px`;
    layer.appendChild(clone);
    activeFlights++;

    const dur = opts.durationMs / 1000;
    const arcHeight = opts.arcHeight ?? Math.max(50, Math.abs(toRect.top - fromRect.top) * 0.35);
    const scaleX = toRect.width / fromRect.width;
    const scaleY = toRect.height / fromRect.height;
    const goingRight = toRect.left >= fromRect.left;

    const state = { t: 0 };
    const tl = gsap.timeline({
      onComplete: () => {
        activeFlights--;
        releaseClone(clone);
        resolve();
      },
    });

    tl.to(state, {
      t: 1,
      duration: dur,
      ease: opts.ease ?? 'power2.inOut',
      onUpdate: () => {
        const t = state.t;
        const p = arcPoint(fromRect, toRect, arcHeight, t);
        const s = 1 + (Math.min(scaleX, scaleY) - 1) * t;
        const lift = Math.sin(t * Math.PI);
        const rotY = opts.flipInFlight
          ? 180 * t + (goingRight ? -8 : 8) * lift
          : (goingRight ? -12 : 12) * lift;
        const rotX = 6 * lift;
        clone.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) scale(${s}) perspective(700px) rotateY(${rotY}deg) rotateX(${rotX}deg)`;
        clone.style.boxShadow = `0 ${6 + 22 * lift}px ${24 + 30 * lift}px rgba(0,0,0,${0.55 - 0.2 * lift})`;
        if (opts.flipInFlight && t >= 0.5 && !flipped) {
          flipped = true;
          img.src = opts.imageUrl ?? CARD_BACK_URL;
          img.style.transform = 'rotateY(180deg)';
        }
      },
    });

    registerActiveTimeline(tl);
  });
}

const activeTimelines = new Set<gsap.core.Timeline>();

export function registerActiveTimeline(tl: gsap.core.Timeline): void {
  activeTimelines.add(tl);
  const prev = tl.eventCallback('onComplete');
  tl.eventCallback('onComplete', () => {
    activeTimelines.delete(tl);
    if (prev) (prev as () => void)();
  });
}

export function skipAllFlights(): void {
  for (const tl of Array.from(activeTimelines)) {
    tl.progress(1);
  }
}
