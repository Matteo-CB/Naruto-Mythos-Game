import { EVOLVING_CARDS } from './cardCosts';
import { EVOLVING_ALLOWED_SETS, EVOLVING_MAX_POINTS } from './constants';

export function extractSetFromCardId(cardId: string): string {
  if (typeof cardId !== 'string') return '';
  const idx = cardId.indexOf('-');
  if (idx === -1) return '';
  return cardId.slice(0, idx);
}

function cardNumber(cardId: string): string {
  const m = cardId.match(/^[A-Z]+-(\d+)/);
  return m ? m[1] : cardId;
}

export function computeDeckEvolvingPoints(cardIds: readonly string[]): number {
  if (!Array.isArray(cardIds)) return 0;
  const counts = new Map<string, number>();
  for (const id of cardIds) {
    if (typeof id !== 'string') continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let total = 0;
  const flatPaidNumbers = new Set<string>();
  for (const [cardId, copies] of counts) {
    const cost = EVOLVING_CARDS.get(cardId);
    if (!cost) continue;
    if (cost.costMode === 'flat') {
      const num = cardNumber(cardId);
      if (flatPaidNumbers.has(num)) continue;
      flatPaidNumbers.add(num);
      total += cost.pointCost;
    } else {
      total += cost.pointCost * copies;
    }
  }
  return total;
}

export function deckUsesOnlyAllowedSets(
  cardIds: readonly string[],
  missionIds: readonly string[] = [],
): boolean {
  for (const id of cardIds) {
    const set = extractSetFromCardId(id);
    if (!EVOLVING_ALLOWED_SETS.has(set)) return false;
  }
  for (const id of missionIds) {
    const set = extractSetFromCardId(id);
    if (!EVOLVING_ALLOWED_SETS.has(set)) return false;
  }
  return true;
}

export function isEvolvingCompatible(
  cardIds: readonly string[],
  missionIds: readonly string[] = [],
): boolean {
  if (!deckUsesOnlyAllowedSets(cardIds, missionIds)) return false;
  return computeDeckEvolvingPoints(cardIds) <= EVOLVING_MAX_POINTS;
}

export type EvolvingIncompatibilityReason =
  | { kind: 'compatible' }
  | { kind: 'over-budget'; points: number; max: number }
  | { kind: 'set-not-allowed'; cardId: string; set: string };

export function checkEvolvingCompatibility(
  cardIds: readonly string[],
  missionIds: readonly string[] = [],
): EvolvingIncompatibilityReason {
  for (const id of cardIds) {
    const set = extractSetFromCardId(id);
    if (!EVOLVING_ALLOWED_SETS.has(set)) {
      return { kind: 'set-not-allowed', cardId: id, set };
    }
  }
  for (const id of missionIds) {
    const set = extractSetFromCardId(id);
    if (!EVOLVING_ALLOWED_SETS.has(set)) {
      return { kind: 'set-not-allowed', cardId: id, set };
    }
  }
  const points = computeDeckEvolvingPoints(cardIds);
  if (points > EVOLVING_MAX_POINTS) {
    return { kind: 'over-budget', points, max: EVOLVING_MAX_POINTS };
  }
  return { kind: 'compatible' };
}
