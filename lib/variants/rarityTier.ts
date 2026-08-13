export type RarityTier = 'commune' | 'rare' | 'brillante' | 'prestige' | 'sommet';

const TIER_PAR_RARETE: Record<string, RarityTier> = {
  C: 'commune',
  UC: 'commune',
  MMS: 'commune',
  R: 'rare',
  RA: 'brillante',
  S: 'brillante',
  SP: 'prestige',
  SPV: 'prestige',
  CHIBI: 'prestige',
  CHIBIV: 'prestige',
  M: 'prestige',
  MV: 'prestige',
  SHINOBI: 'sommet',
  SHINOBIV: 'sommet',
  L: 'sommet',
  SV: 'sommet',
  POP: 'sommet',
  POPV: 'sommet',
};

const COULEUR_PAR_TIER: Record<RarityTier, string> = {
  commune: 'var(--t-muted)',
  rare: '#3498db',
  brillante: '#9b59b6',
  prestige: '#5fa3df',
  sommet: '#ffd700',
};

const COULEUR_PAR_RARETE: Record<string, string> = {
  RA: 'var(--t-accent)',
  S: '#e08a3c',
  SP: '#5fa3df',
  SPV: '#5fa3df',
  SHINOBI: '#2ecc71',
  SHINOBIV: '#2ecc71',
  L: '#ffd700',
  SV: '#9b59b6',
  POP: '#e0507a',
  POPV: '#e0507a',
  M: '#ff4444',
  MV: '#ff4444',
  CHIBI: '#f0a030',
  CHIBIV: '#f0a030',
};

export function rarityTier(rarity: string): RarityTier {
  return TIER_PAR_RARETE[rarity] ?? 'commune';
}

export function rarityAccent(rarity: string): string {
  return COULEUR_PAR_RARETE[rarity] ?? COULEUR_PAR_TIER[rarityTier(rarity)];
}

export function deservesFinale(rarity: string): boolean {
  const t = rarityTier(rarity);
  return t === 'brillante' || t === 'prestige' || t === 'sommet';
}

export function deservesHoloSheen(rarity: string): boolean {
  return deservesFinale(rarity);
}
