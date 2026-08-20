export type KonohaShidoHit = 'S' | 'L' | 'SV';

export const KONOHA_SHIDO_SET_ID = 'KS';

export const KONOHA_SHIDO_ODDS: ReadonlyArray<{ hit: KonohaShidoHit; oneIn: number }> = [
  { hit: 'SV', oneIn: 4000 },
  { hit: 'L', oneIn: 800 },
  { hit: 'S', oneIn: 10 },
];

export const KONOHA_SHIDO_COMMONS_PER_PACK = 4;
export const KONOHA_SHIDO_UNCOMMONS_PER_PACK = 3;
export const KONOHA_SHIDO_RARES_PER_PACK = 1;
export const KONOHA_SHIDO_MISSIONS_PER_PACK = 1;
export const KONOHA_SHIDO_PACK_SIZE = 10;

export function chaseSlotProbability(): number {
  return KONOHA_SHIDO_ODDS.reduce((total, { oneIn }) => total + 1 / oneIn, 0);
}

export function rollKonohaShidoChase(random: () => number = Math.random): KonohaShidoHit | null {
  const tirage = random();
  let seuil = 0;
  for (const { hit, oneIn } of KONOHA_SHIDO_ODDS) {
    seuil += 1 / oneIn;
    if (tirage < seuil) return hit;
  }
  return null;
}

export function remplacementDeLHolo(random: () => number = Math.random): 'C' | 'UC' {
  const total = KONOHA_SHIDO_COMMONS_PER_PACK + KONOHA_SHIDO_UNCOMMONS_PER_PACK;
  return random() < KONOHA_SHIDO_COMMONS_PER_PACK / total ? 'C' : 'UC';
}
