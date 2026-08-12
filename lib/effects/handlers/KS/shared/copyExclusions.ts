import type { CharacterCard } from '@/lib/engine/types';


const UNCOPYABLE_KS_CARD_NUMBERS = new Set<number>([
  16,
  106,
  115,
]);


export function isCharacterCopyable(topCard: CharacterCard): boolean {
  if (String(topCard.set ?? 'KS') !== 'KS') return true;
  return !UNCOPYABLE_KS_CARD_NUMBERS.has(Number(topCard.number));
}


export function isEffectAlteration(description: string | undefined | null): boolean {
  if (!description) return false;
  return /(?:^|\s)(?:MAIN|AMBUSH|UPGRADE|SCORE|FIRST STRIKE|DUEL)\s+effect\b/.test(description);
}


export function isCopyableEffectType(effectType: string | undefined | null): boolean {
  return effectType !== 'SCORE' && effectType !== 'UPGRADE';
}
