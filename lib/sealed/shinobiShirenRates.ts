export type ShinobiShirenHit = 'RA' | 'S' | 'SP' | 'SHINOBI' | 'L' | 'NUMBERED';

export const SHINOBI_SHIREN_SET_ID = 'SS';

export const SHINOBI_SHIREN_ODDS: ReadonlyArray<{ hit: ShinobiShirenHit; oneIn: number }> = [
  { hit: 'NUMBERED', oneIn: 2950 },
  { hit: 'L', oneIn: 2350 },
  { hit: 'SHINOBI', oneIn: 701 },
  { hit: 'SP', oneIn: 47 },
  { hit: 'S', oneIn: 10 },
  { hit: 'RA', oneIn: 7 },
];

export const NUMBERED_RARITIES: ReadonlyArray<string> = ['SV', 'POP'];

export function chaseSlotProbability(): number {
  return SHINOBI_SHIREN_ODDS.reduce((total, { oneIn }) => total + 1 / oneIn, 0);
}

export function rollShinobiShirenChase(random: () => number = Math.random): ShinobiShirenHit | null {
  const tirage = random();
  let seuil = 0;
  for (const { hit, oneIn } of SHINOBI_SHIREN_ODDS) {
    seuil += 1 / oneIn;
    if (tirage < seuil) return hit;
  }
  return null;
}
