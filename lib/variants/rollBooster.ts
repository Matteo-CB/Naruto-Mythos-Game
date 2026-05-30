import type { CardData } from '@/lib/engine/types';
import {
  VARIANT_PACK_PROBABILITIES,
  VARIANT_PACK_SIZE,
  VARIANT_RARITY_ROLL_ORDER,
  type VariantRarity,
} from './constants';
import { eligibleVariantsForSetByRarity } from './variantPool';
import { pickUniform, systemRng, type Rng } from './rng';

export type RollMode = 'normal' | 'forceL' | 'forceSV';

export interface RollOptions {
  rng?: Rng;
  mode?: RollMode;
}

function rollRarity(rng: Rng): VariantRarity {
  const r = rng.next();
  let cumulative = 0;
  for (const rarity of VARIANT_RARITY_ROLL_ORDER) {
    cumulative += VARIANT_PACK_PROBABILITIES[rarity];
    if (r < cumulative) return rarity;
  }
  return 'RA';
}

function rollSlot(
  pools: Record<VariantRarity, CardData[]>,
  rng: Rng,
  forcedRarity: VariantRarity | null,
): CardData | null {
  const rarity = forcedRarity ?? rollRarity(rng);
  const order: VariantRarity[] = [rarity, 'MV', 'RA', 'L', 'SV'];
  for (const r of order) {
    if (pools[r].length > 0) {
      return pickUniform(pools[r], rng);
    }
  }
  return null;
}

export function rollVariantBooster(setId: string, opts: RollOptions = {}): CardData[] {
  const rng = opts.rng ?? systemRng;
  const mode = opts.mode ?? 'normal';
  const pools = eligibleVariantsForSetByRarity(setId);

  const slots: CardData[] = [];
  for (let i = 0; i < VARIANT_PACK_SIZE; i++) {
    let forced: VariantRarity | null = null;
    if (i === 0) {
      if (mode === 'forceL') forced = 'L';
      else if (mode === 'forceSV') forced = 'SV';
    }
    const card = rollSlot(pools, rng, forced);
    if (card) slots.push(card);
  }
  return slots;
}
