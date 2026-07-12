import { gsap } from 'gsap';
import {
  anchorHandCard, anchorOpponentHand, anchorDeck, resolveAnchor,
  findNewSlotAnchor, getPreUpdateSnapshot,
  type AnchorRect, type PlayerSideId,
} from './boardRegistry';
import { flyCard, skipAllFlights, registerActiveTimeline } from './flightLayer';
import { motionMs } from './speed';
import { normalizeImagePath } from '@/lib/utils/imagePath';

export interface MotionEventData {
  player?: string;
  cardIndex?: number;
  missionIndex?: number;
  cardImage?: string | null;
  hidden?: boolean;
  count?: number;
  newIndexes?: number[];
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
  if (perspective.isMyAction && typeof data.cardIndex === 'number') {
    fromRect = snapshot.get(anchorHandCard(data.cardIndex)) ?? null;
  }
  if (!fromRect) {
    fromRect = snapshot.get(anchorOpponentHand())
      ?? resolveAnchor(anchorOpponentHand())
      ?? null;
  }
  if (!fromRect && typeof data.cardIndex === 'number') {
    fromRect = resolveAnchor(anchorHandCard(0));
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

export async function playDrawFlight(
  data: MotionEventData,
  perspective: { isMyAction: boolean },
): Promise<void> {
  const durationMs = motionMs('draw');
  if (durationMs <= 0) return;

  const count = Math.min(data.count ?? 1, 5);
  const side: PlayerSideId = perspective.isMyAction ? 'me' : 'opp';
  const fromRect = resolveAnchor(anchorDeck(side));
  if (!fromRect) return;

  const mobile = isMobileViewport();
  const flights: Promise<void>[] = [];
  for (let k = 0; k < count; k++) {
    let toRect: AnchorRect | null = null;
    if (perspective.isMyAction) {
      const idx = data.newIndexes?.[k];
      if (typeof idx === 'number') toRect = resolveAnchor(anchorHandCard(idx));
      if (!toRect) toRect = resolveAnchor(anchorHandCard(0));
    } else {
      toRect = resolveAnchor(anchorOpponentHand());
    }
    if (!toRect) continue;

    const flight = new Promise<void>((res) => {
      setTimeout(() => {
        flyCard({
          fromRect,
          toRect: toRect as AnchorRect,
          imageUrl: null,
          durationMs,
          flipInFlight: false,
          isMobile: mobile,
        }).then(res);
      }, k * Math.min(110, durationMs * 0.3));
    });
    flights.push(flight);
  }
  await Promise.all(flights);
}
