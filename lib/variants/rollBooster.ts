import type { CardData } from '@/lib/engine/types';
import {
  VARIANT_PACK_SIZE,
  BOOSTER_SLOT_RARITIES,
  type PackSlotKind,
  type BoosterSlotRarity,
} from './constants';
import { tauxDuBoosterVariante, ordreDeTirage, poidsDeLaCarte } from './rates';
import { eligibleVariantsForSetByRarity, holoEligibleForSet } from './variantPool';
import { decorateHoloCard } from '@/lib/holo/holoId';
import { pickUniform, systemRng, type Rng } from './rng';

export type RollMode = 'normal' | 'forceL' | 'forceSV';

export interface RollOptions {
  rng?: Rng;
  mode?: RollMode;
}

function rollSlotKind(setId: string, rng: Rng): PackSlotKind {
  const taux = tauxDuBoosterVariante(setId);
  const r = rng.next();
  let cumulative = 0;
  for (const kind of ordreDeTirage(setId)) {
    cumulative += taux[kind] ?? 0;
    if (r < cumulative) return kind;
  }
  return 'HOLO_C';
}

// Deux impressions d une meme rarete peuvent ne pas sortir aussi souvent l une que l autre.
function tirageAvecPoids(cartes: readonly CardData[], rng: Rng): CardData {
  const total = cartes.reduce((t, c) => t + poidsDeLaCarte(c.cardId), 0);
  let seuil = rng.next() * total;
  for (const carte of cartes) {
    seuil -= poidsDeLaCarte(carte.cardId);
    if (seuil <= 0) return carte;
  }
  return cartes[cartes.length - 1];
}

function rollSlot(
  setId: string,
  pools: Record<BoosterSlotRarity, CardData[]>,
  holoPools: Record<'HOLO_C' | 'HOLO_UC', CardData[]>,
  rng: Rng,
  forcedKind: PackSlotKind | null,
): CardData | null {
  const kind = forcedKind ?? rollSlotKind(setId, rng);
  const order: PackSlotKind[] = [kind, 'HOLO_C', 'HOLO_UC', ...BOOSTER_SLOT_RARITIES];
  for (const k of order) {
    if (k === 'HOLO_C' || k === 'HOLO_UC') {
      if (holoPools[k].length > 0) {
        return decorateHoloCard(pickUniform(holoPools[k], rng));
      }
    } else if (pools[k].length > 0) {
      return tirageAvecPoids(pools[k], rng);
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
    const card = rollSlot(setId, pools, holoPools, rng, forced);
    if (card) slots.push(card);
  }
  return slots;
}
