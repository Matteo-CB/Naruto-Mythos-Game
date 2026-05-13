export interface EvolvingMpBonus {
  player1: number;
  player2: number;
}

export function computeEvolvingMpBonus(
  player1Points: number,
  player2Points: number,
): EvolvingMpBonus {
  const p1 = sanitizePoints(player1Points);
  const p2 = sanitizePoints(player2Points);
  return {
    player1: Math.max(0, p2 - p1),
    player2: Math.max(0, p1 - p2),
  };
}

function sanitizePoints(n: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
