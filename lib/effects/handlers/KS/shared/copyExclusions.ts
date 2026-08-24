import type { CharacterCard, CharacterInPlay } from '@/lib/engine/types';
import { textIsBlanked } from '@/lib/effects/handlers/SS/attachmentStatics';
import { getCardById } from '@/lib/data/cardIndex';


const UNCOPYABLE_KS_CARD_NUMBERS = new Set<number>([
  16,
  106,
  115,
]);


export function isCharacterCopyable(topCard: CharacterCard): boolean {
  if (String(topCard.set ?? 'KS') !== 'KS') return true;
  return !UNCOPYABLE_KS_CARD_NUMBERS.has(Number(topCard.number));
}


export function isCopyableCharacter(char: CharacterInPlay | undefined | null): boolean {
  if (!char) return false;
  if (char.isHidden) return false;
  if (textIsBlanked(char)) return false;
  const topCard = char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  if (!topCard) return false;
  return isCharacterCopyable(topCard);
}


export function isEffectAlteration(description: string | undefined | null): boolean {
  if (!description) return false;
  return /(?:^|\s)(?:MAIN|AMBUSH|UPGRADE|SCORE|FIRST STRIKE|DUEL)\s+effect\b/.test(description);
}


export function isCopyableEffectType(effectType: string | undefined | null): boolean {
  return effectType !== 'SCORE';
}


const MOTIF_SANS_UPGRADE = /non[- ]upgrade/i;

export function copieurRefuseLesUpgrades(copieurCardId: string | undefined | null): boolean {
  if (!copieurCardId) return false;
  const carte = getCardById(copieurCardId) as { effects?: Array<{ description?: string }> } | undefined;
  if (!carte?.effects) return false;
  return carte.effects.some((e) => MOTIF_SANS_UPGRADE.test(e.description ?? ''));
}


export interface ContexteDeCopie {
  wasRevealed?: boolean;
  wasFirstCard?: boolean;
  wasUpgrade?: boolean;
  copieur?: string;
}


export function isCopyableEffect(
  effect: { type: string; description?: string } | undefined | null,
  context: ContexteDeCopie,
): boolean {
  if (!effect) return false;
  if (!isCopyableEffectType(effect.type)) return false;
  if (effect.description?.includes('[⧗]')) return false;
  if (isEffectAlteration(effect.description)) return false;
  if (effect.type === 'AMBUSH' && !context.wasRevealed) return false;
  if (effect.type === 'FIRST_STRIKE' && !context.wasFirstCard) return false;
  if (effect.type === 'UPGRADE') {
    if (!context.wasUpgrade) return false;
    if (copieurRefuseLesUpgrades(context.copieur)) return false;
  }
  return true;
}
