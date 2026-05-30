import type { Rarity } from '@/lib/engine/types';

export const VARIANT_RARITIES = ['RA', 'MV', 'SV', 'L'] as const;
export type VariantRarity = (typeof VARIANT_RARITIES)[number];

export const VARIANT_PACK_SIZE = 4;

export interface VariantPackProbabilities {
  L: number;
  SV: number;
  MV: number;
  RA: number;
}

export const VARIANT_PACK_PROBABILITIES: VariantPackProbabilities = {
  L: 1 / 200,
  SV: 1 / 1000,
  MV: 1 / 35,
  RA: 1 - 1 / 200 - 1 / 1000 - 1 / 35,
};

export const VARIANT_RARITY_ROLL_ORDER: VariantRarity[] = ['SV', 'L', 'MV', 'RA'];

export const BOOSTER_EXCLUDED_VARIANTS: ReadonlySet<string> = new Set([
  'KS-107-MV',
  'KS-108-MV',
  'KS-120-MV',
  'KS-128-MV',
  'KS-137-MV',
  'KS-133-MV',
  'KS-133_2-MV',
]);

export const TOURNAMENT_PRIZE_CARD_IDS = [
  'KS-107-MV',
  'KS-108-MV',
  'KS-120-MV',
  'KS-128-MV',
] as const;

export type TournamentPrizeCardId = (typeof TOURNAMENT_PRIZE_CARD_IDS)[number];

export const BATTLEPASS_TIER_5_CARD = 'KS-133_2-MV';
export const BATTLEPASS_TIER_25_CARD = 'KS-137-MV';
export const BATTLEPASS_TIER_50_CARD = 'KS-133-MV';

export const DUPLICATE_XP_BY_RARITY: Record<VariantRarity, number> = {
  RA: 10,
  MV: 50,
  SV: 200,
  L: 1000,
};

export function isVariantRarity(r: Rarity | string | undefined | null): r is VariantRarity {
  if (!r) return false;
  return (VARIANT_RARITIES as readonly string[]).includes(r);
}
