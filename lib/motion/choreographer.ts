import { gsap } from 'gsap';
import {
  anchorHandCard, anchorOpponentHand, anchorSlot, anchorDeck, anchorDiscard, anchorEdge,
  resolveAnchor, resolveAnchorElement, findNewSlotAnchor, getPreUpdateSnapshot,
  type AnchorRect, type PlayerSideId,
} from './boardRegistry';
import { CARD_BACK_URL } from './flightLayer';
import { flyCard, skipAllFlights, registerActiveTimeline, spawnDefeatPlaceholder, consumeDefeatPlaceholder } from './flightLayer';
import { motionMs } from './speed';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { playGlVfx, rarityVfxProfile, VFX_PRESETS } from './vfxgl';

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
  rarity?: string;
  isSummon?: boolean;
  origin?: 'hand' | 'deck' | 'discard';
  winner?: string;
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

function cardRectCenteredIn(container: AnchorRect, sizeRef: AnchorRect): AnchorRect {
  const width = sizeRef.width;
  const height = sizeRef.height;
  return {
    left: container.left + container.width / 2 - width / 2,
    top: container.top + container.height / 2 - height / 2,
    width,
    height,
  };
}

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || window.innerHeight < 500;
}

function landingSquash(element: HTMLElement, durationMs: number): void {
  const tl = gsap.timeline();
  tl.fromTo(element,
    { scale: 1.05, y: -2 },
    { scale: 1, y: 0, duration: durationMs / 1000, ease: 'power3.out' },
  );
  registerActiveTimeline(tl);
}

function entranceHold(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const tl = gsap.timeline({ onComplete: resolve });
    tl.to({}, { duration: ms / 1000 });
    registerActiveTimeline(tl);
  });
}


export async function playCardFlight(
  data: MotionEventData,
  perspective: { isMyAction: boolean },
): Promise<void> {
  const durationMs = motionMs(data.hidden ? 'playHidden' : 'play');
  if (durationMs <= 0) return;

  const snapshot = getPreUpdateSnapshot();
  const side: PlayerSideId = data.side ?? (perspective.isMyAction ? 'me' : 'opp');
  const mine = side === 'me';

  const origin = data.origin ?? 'hand';
  let fromRect: AnchorRect | null = null;
  if (origin === 'deck') {
    fromRect = snapshot.get(anchorDeck(side)) ?? resolveAnchor(anchorDeck(side));
  } else if (origin === 'discard') {
    fromRect = snapshot.get(anchorDiscard(side)) ?? resolveAnchor(anchorDiscard(side));
  } else if (mine) {
    if (typeof data.cardIndex === 'number') {
      fromRect = snapshot.get(anchorHandCard(data.cardIndex)) ?? null;
    }
    if (!fromRect) fromRect = resolveAnchor(anchorHandCard(0));
  } else {
    fromRect = snapshot.get(anchorOpponentHand())
      ?? resolveAnchor(anchorOpponentHand())
      ?? null;
  }
  if (!fromRect && typeof window !== 'undefined') {
    fromRect = mine
      ? { left: window.innerWidth / 2 - 40, top: window.innerHeight - 60, width: 80, height: 112 }
      : { left: window.innerWidth / 2 - 40, top: -60, width: 80, height: 112 };
  }

  const missionIndex = data.missionIndex ?? 0;
  const target = findNewSlotAnchor(missionIndex, side, snapshot);
  if (!fromRect || !target) return;

  if (!mine || origin !== 'hand') {
    fromRect = cardRectCenteredIn(fromRect, target.rect);
  }

  const imageUrl = data.hidden ? null : (data.cardImage ? normalizeImagePath(data.cardImage) : null);

  target.element.style.visibility = 'hidden';
  try {
    await flyCard({
      fromRect,
      toRect: target.rect,
      imageUrl,
      durationMs,
      isMobile: isMobileViewport(),
      ease: 'power2.out',
    });
  } finally {
    target.element.style.visibility = '';
  }
  landingSquash(target.element, Math.max(180, durationMs * 0.35));
  if (!data.hidden) {
    const profile = rarityVfxProfile(data.rarity);
    if (profile.tier >= 2) {
      const landRect = target.element.getBoundingClientRect();
      void playGlVfx('burst', landRect, {
        color: profile.color,
        secondary: profile.secondary,
        intensity: profile.intensity,
        scale: profile.scale,
        durationMs: profile.durationMs,
      });
      if (profile.tier >= 3) vignette(profile.durationMs + 350);
      void playGlVfx('aura', landRect, {
        color: profile.color,
        secondary: profile.secondary,
        intensity: profile.tier >= 3 ? profile.intensity : profile.intensity * 0.75,
        scale: profile.tier >= 3 ? profile.scale * 1.1 : profile.scale * 0.9,
        durationMs: profile.tier >= 3 ? 1000 : 750,
      });
      punch(target.element, profile.tier >= 3 ? 1.16 : 1.1);
      await entranceHold(profile.tier >= 3 ? 650 : 450);
    }
  }
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

function vignette(totalMs: number, strength = 0.5): void {
  if (typeof document === 'undefined') return;
  const div = document.createElement('div');
  div.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:42;background-color:rgba(2,2,6,${strength});opacity:0;`;
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

  void playGlVfx('kawarimi', rect, { ...VFX_PRESETS.kawarimi });
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

export function holdDefeatedCardInPlace(data: MotionEventData): void {
  if (typeof document === 'undefined') return;
  if (motionMs('defeat') <= 0) return;
  if (typeof data.missionIndex !== 'number' || !data.side || !data.instanceId) return;
  const anchor = anchorSlot(data.missionIndex, data.side, data.instanceId);
  const rect = getPreUpdateSnapshot().get(anchor) ?? resolveAnchor(anchor);
  if (!rect) return;
  spawnDefeatPlaceholder(
    data.instanceId,
    rect,
    data.cardImage ? normalizeImagePath(data.cardImage) : null,
  );
}

export async function playDefeatFlight(data: MotionEventData): Promise<void> {
  const durationMs = motionMs('defeat');
  if (durationMs <= 0) {
    if (data.instanceId) consumeDefeatPlaceholder(data.instanceId);
    return;
  }
  if (typeof data.missionIndex !== 'number' || !data.side || !data.instanceId) return;
  const snapshot = getPreUpdateSnapshot();
  const placeholderRect = consumeDefeatPlaceholder(data.instanceId);
  const fromRect = placeholderRect ?? snapshot.get(anchorSlot(data.missionIndex, data.side, data.instanceId));
  const toRect = resolveAnchor(anchorDiscard(data.discardSide ?? data.side));
  if (!fromRect || !toRect) return;

  const flash = overlayAt(fromRect, 'box-shadow:0 0 24px rgba(179,62,62,0.8), inset 0 0 16px rgba(179,62,62,0.55);opacity:0;');
  const flashTl = gsap.timeline({ onComplete: () => flash.remove() });
  flashTl.to(flash, { opacity: 1, duration: 0.1 }).to(flash, { opacity: 0, duration: 0.2 });
  registerActiveTimeline(flashTl);
  void playGlVfx('slash', fromRect, { ...VFX_PRESETS.slash });

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

  const live = el.getBoundingClientRect();
  await new Promise<void>((resolve) => {
    const tl = gsap.timeline({ onComplete: resolve });
    tl.to({}, { duration: Math.min(0.15, durationMs / 2000) });
    registerActiveTimeline(tl);
  });
  const profile = rarityVfxProfile(data.rarity);
  if (profile.tier >= 2) {
    void playGlVfx('burst', { left: live.left, top: live.top, width: live.width, height: live.height }, {
      color: profile.color,
      secondary: profile.secondary,
      intensity: Math.min(profile.intensity, 0.8),
      scale: Math.min(profile.scale, 1.1),
      durationMs: 450,
    });
  }
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
  if (data.delta >= 2) {
    void playGlVfx('ring', { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, { ...VFX_PRESETS.ring });
  }
  await new Promise<void>((resolve) => {
    const tl = gsap.timeline({ onComplete: () => { label.remove(); resolve(); } });
    tl.fromTo(label, { y: 6, opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1.1, y: -10, duration: 0.18, ease: 'power2.out' })
      .to(label, { y: -26, opacity: 0, duration: Math.max(0.25, durationMs / 1000 - 0.18), ease: 'power1.in' });
    registerActiveTimeline(tl);
  });
}

export async function playGameEndCinematic(data: MotionEventData, perspective: { isMyWin: boolean | null }): Promise<void> {
  if (typeof document === 'undefined') return;
  const durationMs = motionMs('missionScore');
  if (durationMs <= 0) return;

  const dim = document.createElement('div');
  dim.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:42;background-color:rgba(2,2,6,0.55);opacity:0;';
  document.body.appendChild(dim);
  const dimTl = gsap.timeline({ onComplete: () => dim.remove() });
  dimTl.to(dim, { opacity: 1, duration: 0.35 }).to(dim, { opacity: 0, duration: 0.4 }, 1.0);
  registerActiveTimeline(dimTl);

  if (perspective.isMyWin === null) return;
  const loserSide: PlayerSideId = perspective.isMyWin ? 'opp' : 'me';
  const els = document.querySelectorAll(`[data-anchor^="slot:"]`);
  const losers: HTMLElement[] = [];
  els.forEach((el) => {
    const id = el.getAttribute('data-anchor') ?? '';
    if (id.split(':')[2] === loserSide) losers.push(el as HTMLElement);
  });
  if (losers.length === 0) return;

  await new Promise<void>((resolve) => {
    const tl = gsap.timeline({ onComplete: resolve });
    losers.forEach((el, i) => {
      const dir = i % 2 === 0 ? 1 : -1;
      tl.to(innerOf(el), {
        rotation: dir * (8 + (i % 3) * 5),
        y: 18,
        opacity: 0.45,
        duration: 0.55,
        ease: 'power2.in',
      }, i * 0.06);
    });
    registerActiveTimeline(tl);
  });
}
