export type Direction = 'up' | 'down' | 'left' | 'right';

export interface FocusRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function centerOf(r: FocusRect): { x: number; y: number } {
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
}

export function rectsOverlapOnAxis(a: FocusRect, b: FocusRect, axis: 'x' | 'y'): number {
  if (axis === 'x') {
    return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  }
  return Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

function directionalCost(current: FocusRect, candidate: FocusRect, dir: Direction): number | null {
  const c = centerOf(current);
  const t = centerOf(candidate);
  const dx = t.x - c.x;
  const dy = t.y - c.y;

  let ahead: number;
  let off: number;
  let overlap: number;

  switch (dir) {
    case 'right':
      if (candidate.left < current.right - 2 && dx < 6) return null;
      ahead = Math.max(candidate.left - current.right, dx);
      off = Math.abs(dy);
      overlap = rectsOverlapOnAxis(current, candidate, 'y');
      break;
    case 'left':
      if (candidate.right > current.left + 2 && dx > -6) return null;
      ahead = Math.max(current.left - candidate.right, -dx);
      off = Math.abs(dy);
      overlap = rectsOverlapOnAxis(current, candidate, 'y');
      break;
    case 'down':
      if (candidate.top < current.bottom - 2 && dy < 6) return null;
      ahead = Math.max(candidate.top - current.bottom, dy);
      off = Math.abs(dx);
      overlap = rectsOverlapOnAxis(current, candidate, 'x');
      break;
    case 'up':
      if (candidate.bottom > current.top + 2 && dy > -6) return null;
      ahead = Math.max(current.top - candidate.bottom, -dy);
      off = Math.abs(dx);
      overlap = rectsOverlapOnAxis(current, candidate, 'x');
      break;
  }

  if (ahead < 0) ahead = 0;

  const aligned = overlap > 0;
  const coneSlack = aligned ? Infinity : ahead * 1.6 + 48;
  if (off > coneSlack) return null;

  const alignmentPenalty = aligned ? off * 0.35 : off * 2.4;
  return ahead + alignmentPenalty;
}

export function pickInDirection<T extends { rect: FocusRect }>(
  current: FocusRect,
  candidates: T[],
  dir: Direction,
): T | null {
  let best: T | null = null;
  let bestCost = Infinity;
  for (const cand of candidates) {
    const cost = directionalCost(current, cand.rect, dir);
    if (cost === null) continue;
    if (cost < bestCost) {
      bestCost = cost;
      best = cand;
    }
  }
  return best;
}

export function pickNearest<T extends { rect: FocusRect }>(
  origin: { x: number; y: number },
  candidates: T[],
): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const cand of candidates) {
    const c = centerOf(cand.rect);
    const d = (c.x - origin.x) ** 2 + (c.y - origin.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = cand;
    }
  }
  return best;
}
