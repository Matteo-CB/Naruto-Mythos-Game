import type { CardData } from '@/lib/engine/types';

export const LANDSCAPE_ASPECT = '3.5 / 2.5';
export const PORTRAIT_ASPECT = '2.5 / 3.5';

export function isLandscapeCard(card: Pick<CardData, 'card_type'> & { attach_to?: string | null }): boolean {
  if (card.card_type === 'mission') return true;
  return card.card_type === 'attachment' && card.attach_to === 'mission';
}

export function cardAspectRatio(card: Pick<CardData, 'card_type'> & { attach_to?: string | null }): string {
  return isLandscapeCard(card) ? LANDSCAPE_ASPECT : PORTRAIT_ASPECT;
}

export function hasCombatStats(card: Pick<CardData, 'card_type'>): boolean {
  return card.card_type === 'character' || card.card_type === 'attachment';
}
