import { getAllCards } from '@/lib/data/cardLoader';
import { isLockedVariantCard } from '@/lib/variants/isVariant';
import { BOOSTER_SLOT_RARITIES } from '@/lib/variants/constants';
import { isBoosterObtainableVariant, getVariantObtentionMode } from '@/lib/variants/obtention';
import { seasonCardIds, SEASON_SET_ID } from '@/lib/battlepass/season';
import {
  BATTLEPASS_TIER_5_CARD,
  BATTLEPASS_TIER_25_CARD,
  BATTLEPASS_TIER_50_CARD,
} from '@/lib/variants/constants';

const RARETES_DE_BOOSTER = new Set<string>(BOOSTER_SLOT_RARITIES as readonly string[]);

export function recompensesDeBattlepass(): Set<string> {
  return new Set<string>([
    ...seasonCardIds(),
    BATTLEPASS_TIER_5_CARD,
    BATTLEPASS_TIER_25_CARD,
    BATTLEPASS_TIER_50_CARD,
  ]);
}

export function sortDUnBooster(cardId: string, rarity: string): boolean {
  if (!RARETES_DE_BOOSTER.has(rarity)) return false;
  return isBoosterObtainableVariant(cardId);
}

export function poolDePrixDeTournoi(setId: string = SEASON_SET_ID): string[] {
  const recompensesDePalier = recompensesDeBattlepass();
  return getAllCards()
    .filter((c) => c.set === setId)
    .filter((c) => isLockedVariantCard(c))
    .filter((c) => !sortDUnBooster(c.id, String(c.rarity)))
    .filter((c) => !recompensesDePalier.has(c.id))
    .filter((c) => getVariantObtentionMode(c.id) !== 'locked')
    .map((c) => c.id)
    .sort();
}

export function poolDePrixTousSets(): string[] {
  const recompensesDePalier = recompensesDeBattlepass();
  return getAllCards()
    .filter((c) => isLockedVariantCard(c))
    .filter((c) => !sortDUnBooster(c.id, String(c.rarity)))
    .filter((c) => !recompensesDePalier.has(c.id))
    .filter((c) => getVariantObtentionMode(c.id) !== 'locked')
    .map((c) => c.id)
    .sort();
}

export function estUnPrixDeTournoiValide(cardId: unknown): cardId is string {
  return typeof cardId === 'string' && poolDePrixTousSets().includes(cardId);
}

export function tirerUnPrixDeTournoi(
  aleatoire: () => number = Math.random,
  setId: string = SEASON_SET_ID,
): string | null {
  const pool = poolDePrixDeTournoi(setId);
  if (pool.length === 0) return null;
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(aleatoire() * pool.length)));
  return pool[index];
}
