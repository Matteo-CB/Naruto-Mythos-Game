export type PlayerSideId = 'me' | 'opp';

export function anchorHandCard(index: number): string {
  return `hand:me:${index}`;
}

export function anchorOpponentHand(): string {
  return 'hand:opp';
}

export function anchorSlot(missionIndex: number, side: PlayerSideId, instanceId: string): string {
  return `slot:${missionIndex}:${side}:${instanceId}`;
}

export function anchorMission(missionIndex: number): string {
  return `mission:${missionIndex}`;
}

export function anchorDeck(side: PlayerSideId): string {
  return `deck:${side}`;
}

export function anchorDiscard(side: PlayerSideId): string {
  return `discard:${side}`;
}

export function anchorScore(side: PlayerSideId): string {
  return `score:${side}`;
}

export function anchorChakra(side: PlayerSideId): string {
  return `chakra:${side}`;
}

export function anchorEdge(): string {
  return 'edge';
}

export interface AnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type BoardSnapshot = Map<string, AnchorRect>;

function toAnchorRect(r: DOMRect): AnchorRect {
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export function resolveAnchor(id: string): AnchorRect | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector(`[data-anchor="${id}"]`);
  if (!el) return null;
  return toAnchorRect(el.getBoundingClientRect());
}

export function resolveAnchorElement(id: string): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector(`[data-anchor="${id}"]`);
}

export function captureBoardSnapshot(): BoardSnapshot {
  const snapshot: BoardSnapshot = new Map();
  if (typeof document === 'undefined') return snapshot;
  const els = document.querySelectorAll('[data-anchor]');
  els.forEach((el) => {
    const id = el.getAttribute('data-anchor');
    if (id) snapshot.set(id, toAnchorRect(el.getBoundingClientRect()));
  });
  return snapshot;
}

export function findNewSlotAnchor(
  missionIndex: number,
  side: PlayerSideId,
  snapshot: BoardSnapshot,
): { id: string; rect: AnchorRect; element: HTMLElement } | null {
  if (typeof document === 'undefined') return null;
  const prefix = `slot:${missionIndex}:${side}:`;
  const els = document.querySelectorAll(`[data-anchor^="${prefix}"]`);
  for (const el of Array.from(els)) {
    const id = el.getAttribute('data-anchor');
    if (id && !snapshot.has(id)) {
      return { id, rect: toAnchorRect(el.getBoundingClientRect()), element: el as HTMLElement };
    }
  }
  return null;
}

let lastSnapshot: BoardSnapshot = new Map();
let snapshotFresh = false;

export function stashPreUpdateSnapshot(): void {
  if (snapshotFresh) return;
  lastSnapshot = captureBoardSnapshot();
  snapshotFresh = true;
  queueMicrotask(() => { snapshotFresh = false; });
}

export function getPreUpdateSnapshot(): BoardSnapshot {
  return lastSnapshot;
}
