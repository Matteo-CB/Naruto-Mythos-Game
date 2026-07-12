import type { CardData } from '@/lib/engine/types';
import {
  VARIANT_PACK_PROBABILITIES,
  VARIANT_PACK_SIZE,
  VARIANT_RARITY_ROLL_ORDER,
  type PackSlotKind,
  type VariantRarity,
} from './constants';
import { eligibleVariantsForSetByRarity, holoEligibleForSet } from './variantPool';
import { decorateHoloCard } from '@/lib/holo/holoId';
import { pickUniform, systemRng, type Rng } from './rng';

export type RollMode = 'normal' | 'forceL' | 'forceSV';

export interface RollOptions {
  rng?: Rng;
  mode?: RollMode;
}

function rollSlotKind(rng: Rng): PackSlotKind {
  const r = rng.next();
  let cumulative = 0;
  for (const kind of VARIANT_RARITY_ROLL_ORDER) {
    cumulative += VARIANT_PACK_PROBABILITIES[kind];
    if (r < cumulative) return kind;
  }
  return 'HOLO_C';
}

function rollSlot(
  pools: Record<VariantRarity, CardData[]>,
  holoPools: Record<'HOLO_C' | 'HOLO_UC', CardData[]>,
  rng: Rng,
  forcedKind: PackSlotKind | null,
): CardData | null {
  const kind = forcedKind ?? rollSlotKind(rng);
  const order: PackSlotKind[] = [kind, 'HOLO_C', 'HOLO_UC', 'RA', 'MV', 'L', 'SV'];
  for (const k of order) {
    if (k === 'HOLO_C' || k === 'HOLO_UC') {
      if (holoPools[k].length > 0) {
        return decorateHoloCard(pickUniform(holoPools[k], rng));
      }
    } else if (pools[k].length > 0) {
      return pickUniform(pools[k], rng);
    }
  }
  return null;
}

export function rollVariantBooster(setId: string, opts: RollOptions = {}): CardData[] {
  const rng = opts.rng ?? systemRng;
  const mode = opts.mode ?? 'normal';
  const pools = eligibleVariantsForSetByRarity(setId);
  const holoPools = holoEligibleForSet(setId);

  const slots: CardData[] = [];
  for (let i = 0; i < VARIANT_PACK_SIZE; i++) {
    let forced: PackSlotKind | null = null;
    if (i === 0) {
      if (mode === 'forceL') forced = 'L';
      else if (mode === 'forceSV') forced = 'SV';
    }
    const card = rollSlot(pools, holoPools, rng, forced);
    if (card) slots.push(card);
  }
  return slots;
}
