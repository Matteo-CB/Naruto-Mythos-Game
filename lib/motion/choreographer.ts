import { gsap } from 'gsap';
import {
  anchorHandCard, anchorOpponentHand, anchorSlot, anchorDiscard, anchorEdge,
  resolveAnchor, resolveAnchorElement, findNewSlotAnchor, getPreUpdateSnapshot,
  type AnchorRect, type PlayerSideId,
} from './boardRegistry';
import { CARD_BACK_URL } from './flightLayer';
import { flyCard, skipAllFlights, registerActiveTimeline } from './flightLayer';
import { motionMs } from './speed';
import { normalizeImagePath } from '@/lib/utils/imagePath';

export interface MotionEventData {
  player?: string;
  cardIndex?: number;
  missionIndex?: number;
  cardImage?: string | null;
  hidden?: boolean;
  instanceId?: string;
  side?: PlayerSideId;
  fromMissionIndex?: number;
  fromSide?: PlayerSideId;
  discardSide?: PlayerSideId;
  hasAmbush?: boolean;
  delta?: number;
  to?: PlayerSideId;
}

let skipListenerInstalled = false;

export function installSkipListener(): () => void {
  if (typeof document === 'undefined' || skipListenerInstalled) return () => {};
  skipListenerInstalled = true;
  const onPointerDown = () => skipAllFlights();
  document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
  return () => {
    skipListenerInstalled = false;
    document.removeEventListener('pointerdown', onPointerDown, { capture: true });
  };
}

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || window.innerHeight < 500;
}

function landingSquash(element: HTMLElement, durationMs: number): void {
  const tl = gsap.timeline();
  tl.fromTo(element,
    { scale: 1.12, y: -4 },
    { scale: 1, y: 0, duration: durationMs / 1000, ease: 'back.out(2.4)' },
  );
  registerActiveTimeline(tl);
}

function landingRing(rect: AnchorRect): void {
  if (typeof document === 'undefined') return;
  const ring = document.createElement('div');
  const size = Math.max(rect.width, rect.height);
  ring.style.cssText = [
    'position:fixed', 'pointer-events:none', 'z-index:44',
    `left:${rect.left + rect.width / 2 - size / 2}px`,
    `top:${rect.top + rect.height / 2 - size / 2}px`,
    `width:${size}px`, `height:${size}px`,
    'border-radius:9999px',
    'box-shadow:0 0 18px rgba(196,163,90,0.5), inset 0 0 12px rgba(196,163,90,0.35)',
    'opacity:0.8', 'transform:scale(0.6)',
  ].join(';');
  document.body.appendChild(ring);
  const tl = gsap.timeline({ onComplete: () => ring.remove() });
  tl.to(ring, { scale: 1.5, opacity: 0, duration: 0.4, ease: 'power2.out' });
  registerActiveTimeline(tl);
}

export async function playCardFlight(
  data: MotionEventData,
  perspective: { isMyAction: boolean },
): Promise<void> {
  const durationMs = motionMs(data.hidden ? 'playHidden' : 'play');
  if (durationMs <= 0) return;

  const snapshot = getPreUpdateSnapshot();
  const side: PlayerSideId = perspective.isMyAction ? 'me' : 'opp';

  let fromRect: AnchorRect | null = null;
  if (perspective.isMyAction) {
    if (typeof data.cardIndex === 'number') {
      fromRect = snapshot.get(anchorHandCard(data.cardIndex)) ?? null;
    }
    if (!fromRect) fromRect = resolveAnchor(anchorHandCard(0));
    if (!fromRect && typeof window !== 'undefined') {
      fromRect = { left: window.innerWidth / 2 - 40, top: window.innerHeight - 60, width: 80, height: 112 };
    }
  } else {
    fromRect = snapshot.get(anchorOpponentHand())
      ?? resolveAnchor(anchorOpponentHand())
      ?? null;
    if (!fromRect && typeof window !== 'undefined') {
      fromRect = { left: window.innerWidth / 2 - 40, top: -60, width: 80, height: 112 };
    }
  }

  const missionIndex = data.missionIndex ?? 0;
  const target = findNewSlotAnchor(missionIndex, side, snapshot);
  if (!fromRect || !target) return;

  const imageUrl = data.hidden ? null : (data.cardImage ? normalizeImagePath(data.cardImage) : null);

  target.element.style.visibility = 'hidden';
  try {
    await flyCard({
      fromRect,
      toRect: target.rect,
      imageUrl,
      durationMs,
      isMobile: isMobileViewport(),
    });
  } finally {
    target.element.style.visibility = '';
  }
  landingSquash(target.element, Math.max(180, durationMs * 0.35));
  landingRing(target.rect);
}

function innerOf(el: HTMLElement): HTMLElement {
  return (el.firstElementChild as HTMLElement) ?? el;
}

function punch(el: HTMLElement, strength = 1.16): void {
  const tl = gsap.timeline();
  tl.fromTo(innerOf(el), { scale: strength }, { scale: 1, duration: 0.28, ease: 'back.out(2.6)' });
  registerActiveTimeline(tl);
}

function overlayAt(rect: AnchorRect, css: string): HTMLDivElement {
  const div = document.createElement('div');
  div.style.cssText = `position:fixed;pointer-events:none;z-index:46;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;` + css;
  document.body.appendChild(div);
  return div;
}

function vignette(totalMs: number): void {
  if (typeof document === 'undefined') return;
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:42;background-color:rgba(2,2,6,0.5);opacity:0;';
  document.body.appendChild(div);
  const tl = gsap.timeline({ onComplete: () => div.remove() });
  tl.to(div, { opacity: 1, duration: 0.15, ease: 'power1.out' })
    .to(div, { opacity: 0, duration: 0.25, ease: 'power1.in' }, Math.max(0.2, totalMs / 1000 - 0.25));
  registerActiveTimeline(tl);
}

function flipCloneAway(rect: AnchorRect, imageUrl: string, durationS: number): Promise<void> {
  return new Promise((resolve) => {
    const div = overlayAt(rect, 'transform-origin:center;backface-visibility:hidden;');
    const img = document.createElement('img');
    img.src = imageUrl;
    img.draggable = false;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    div.appendChild(img);
    const tl = gsap.timeline({ onComplete: () => { div.remove(); resolve(); } });
    tl.fromTo(div, { rotateY: 0 }, { rotateY: 90, duration: durationS, ease: 'power1.in' });
    registerActiveTimeline(tl);
  });
}

function slotElement(data: MotionEventData): HTMLElement | null {
  if (typeof data.missionIndex !== 'number' || !data.side || !data.instanceId) return null;
  return resolveAnchorElement(anchorSlot(data.missionIndex, data.side, data.instanceId));
}

export async function playRevealInPlace(data: MotionEventData): Promise<void> {
  const durationMs = motionMs('reveal');
  if (durationMs <= 0) return;
  const el = slotElement(data);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  vignette(durationMs);

  el.style.visibility = 'hidden';
  await flipCloneAway(rect, CARD_BACK_URL, (durationMs * 0.35) / 1000);
  el.style.visibility = '';

  await new Promise<void>((resolve) => {
    const tl = gsap.timeline({ onComplete: resolve });
    tl.fromTo(innerOf(el),
      { rotateY: -90, scale: 1.28 },
      { rotateY: 0, scale: 1, duration: (durationMs * 0.5) / 1000, ease: 'back.out(1.6)' },
    );
    registerActiveTimeline(tl);
  });

  if (data.hasAmbush) {
    const flash = overlayAt(el.getBoundingClientRect(), 'box-shadow:0 0 26px rgba(179,62,62,0.85), inset 0 0 18px rgba(179,62,62,0.5);opacity:0;');
    const tl = gsap.timeline({ onComplete: () => flash.remove() });
    tl.to(flash, { opacity: 1, duration: 0.12 }).to(flash, { opacity: 0, duration: 0.3 });
    registerActiveTimeline(tl);
  }
}

export async function playHideInPlace(data: MotionEventData): Promise<void> {
  const durationMs = motionMs('playHidden');
  if (durationMs <= 0) return;
  const el = slotElement(data);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const face = data.cardImage ? normalizeImagePath(data.cardImage) : null;

  el.style.visibility = 'hidden';
  if (face) await flipCloneAway(rect, face, (durationMs * 0.4) / 1000);
  el.style.visibility = '';

  await new Promise<void>((resolve) => {
    const tl = gsap.timeline({ onComplete: resolve });
    tl.fromTo(innerOf(el),
      { rotateY: 90 },
      { rotateY: 0, duration: (durationMs * 0.45) / 1000, ease: 'power2.out' },
    );
    registerActiveTimeline(tl);
  });
}

export async function playRelocate(data: MotionEventData): Promise<void> {
  const durationMs = motionMs('move');
  if (durationMs <= 0) return;
  const el = slotElement(data);
  if (!el || typeof data.fromMissionIndex !== 'number' || !data.fromSide || !data.instanceId) return;
  const snapshot = getPreUpdateSnapshot();
  const fromRect = snapshot.get(anchorSlot(data.fromMissionIndex, data.fromSide, data.instanceId));
  if (!fromRect) return;
  const newRect = el.getBoundingClientRect();
  const scale = el.offsetWidth > 0 ? newRect.width / el.offsetWidth : 1;
  const dx = (fromRect.left - newRect.left) / (scale || 1);
  const dy = (fromRect.top - newRect.top) / (scale || 1);
  if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;

  const prevZ = el.style.zIndex;
  el.style.zIndex = '30';
  await new Promise<void>((resolve) => {
    const tl = gsap.timeline({ onComplete: resolve });
    tl.fromTo(el, { x: dx, y: dy }, { x: 0, y: 0, duration: durationMs / 1000, ease: 'power2.inOut' });
    registerActiveTimeline(tl);
  });
  el.style.zIndex = prevZ;
  punch(el, 1.08);
}

export async function playDefeatFlight(data: MotionEventData): Promise<void> {
  const durationMs = motionMs('defeat');
  if (durationMs <= 0) return;
  if (typeof data.missionIndex !== 'number' || !data.side || !data.instanceId) return;
  const snapshot = getPreUpdateSnapshot();
  const fromRect = snapshot.get(anchorSlot(data.missionIndex, data.side, data.instanceId));
  const toRect = resolveAnchor(anchorDiscard(data.discardSide ?? data.side));
  if (!fromRect || !toRect) return;

  const flash = overlayAt(fromRect, 'box-shadow:0 0 24px rgba(179,62,62,0.8), inset 0 0 16px rgba(179,62,62,0.55);opacity:0;');
  const flashTl = gsap.timeline({ onComplete: () => flash.remove() });
  flashTl.to(flash, { opacity: 1, duration: 0.1 }).to(flash, { opacity: 0, duration: 0.2 });
  registerActiveTimeline(flashTl);

  await flyCard({
    fromRect,
    toRect,
    imageUrl: data.cardImage ? normalizeImagePath(data.cardImage) : null,
    durationMs,
    arcHeight: 30,
    isMobile: isMobileViewport(),
  });

  const discardEl = resolveAnchorElement(anchorDiscard(data.discardSide ?? data.side));
  if (discardEl) punch(discardEl, 1.2);
}

export async function playUpgradeMerge(data: MotionEventData): Promise<void> {
  const durationMs = motionMs('upgrade');
  if (durationMs <= 0) return;
  const el = slotElement(data);
  if (!el) return;
  const snapshot = getPreUpdateSnapshot();

  let fromRect: AnchorRect | null = null;
  if (data.side === 'me') {
    if (typeof data.cardIndex === 'number') {
      fromRect = snapshot.get(anchorHandCard(data.cardIndex)) ?? null;
    }
    if (!fromRect) fromRect = resolveAnchor(anchorHandCard(0));
  } else {
    fromRect = snapshot.get(anchorOpponentHand()) ?? resolveAnchor(anchorOpponentHand());
  }
  if (!fromRect) return;

  const live = el.getBoundingClientRect();
  await flyCard({
    fromRect,
    toRect: { left: live.left, top: live.top, width: live.width, height: live.height },
    imageUrl: data.cardImage ? normalizeImagePath(data.cardImage) : null,
    durationMs,
    isMobile: isMobileViewport(),
  });
  punch(el, 1.22);
}

export async function playEdgeTransfer(): Promise<void> {
  const durationMs = motionMs('edge');
  if (durationMs <= 0) return;
  const el = resolveAnchorElement(anchorEdge());
  if (!el) return;
  const snapshot = getPreUpdateSnapshot();
  const fromRect = snapshot.get(anchorEdge());
  if (!fromRect) return;
  const newRect = el.getBoundingClientRect();
  const scale = el.offsetWidth > 0 ? newRect.width / el.offsetWidth : 1;
  const dx = (fromRect.left - newRect.left) / (scale || 1);
  const dy = (fromRect.top - newRect.top) / (scale || 1);
  if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
    punch(el, 1.25);
    return;
  }
  await new Promise<void>((resolve) => {
    const tl = gsap.timeline({ onComplete: resolve });
    tl.fromTo(el, { x: dx, y: dy, rotation: -180 }, { x: 0, y: 0, rotation: 0, duration: durationMs / 1000, ease: 'power2.inOut' });
    registerActiveTimeline(tl);
  });
}

export async function playTokenDelta(data: MotionEventData): Promise<void> {
  const durationMs = motionMs('token');
  if (durationMs <= 0) return;
  const el = slotElement(data);
  if (!el || !data.delta) return;
  const rect = el.getBoundingClientRect();
  const positive = data.delta > 0;
  const label = document.createElement('div');
  label.textContent = `${positive ? '+' : ''}${data.delta}`;
  label.style.cssText = [
    'position:fixed', 'pointer-events:none', 'z-index:46',
    `left:${rect.left + rect.width / 2 - 20}px`,
    `top:${rect.top - 6}px`,
    'width:40px', 'text-align:center',
    'font-weight:800', 'font-size:16px',
    `color:${positive ? '#e6c36a' : '#d97676'}`,
    'text-shadow:0 2px 8px rgba(0,0,0,0.9)',
  ].join(';');
  document.body.appendChild(label);
  punch(el, 1.12);
  await new Promise<void>((resolve) => {
    const tl = gsap.timeline({ onComplete: () => { label.remove(); resolve(); } });
    tl.fromTo(label, { y: 6, opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1.1, y: -10, duration: 0.18, ease: 'power2.out' })
      .to(label, { y: -26, opacity: 0, duration: Math.max(0.25, durationMs / 1000 - 0.18), ease: 'power1.in' });
    registerActiveTimeline(tl);
  });
}
