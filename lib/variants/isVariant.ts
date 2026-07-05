import type { CardData } from '@/lib/engine/types';
import { isVariantRarity, isSpecialVariant, isLockedVariant, type VariantRarity } from './constants';

export function isVariantCard(card: Pick<CardData, 'rarity'> | null | undefined): boolean {
  if (!card) return false;
  return isSpecialVariant(card.rarity);
}

export function isLockedVariantCard(card: Pick<CardData, 'rarity'> | null | undefined): boolean {
  if (!card) return false;
  return isLockedVariant(card.rarity);
}

export function getVariantRarity(card: Pick<CardData, 'rarity'> | null | undefined): VariantRarity | null {
  if (!card) return null;
  return isVariantRarity(card.rarity) ? (card.rarity as VariantRarity) : null;
}

export function parseCardId(cardId: string): { set: string; number: string; rarity: string } | null {
  const m = cardId.match(/^([A-Z]+)-([A-Za-z0-9_]+)-([A-Z]+)$/);
  if (!m) return null;
  return { set: m[1], number: m[2], rarity: m[3] };
}

export function stripVariantSuffix(numberPart: string): string {
  const m = numberPart.match(/^(\d+)(?:_\d+)?$/);
  return m ? m[1] : numberPart;
}

export function baseCardIdFor(cardId: string): string {
  const parsed = parseCardId(cardId);
  if (!parsed) return cardId;
  const num = stripVariantSuffix(parsed.number);
  switch (parsed.rarity) {
    case 'RA':
      return `${parsed.set}-${num}-R`;
    case 'SV':
      return `${parsed.set}-${num}-S`;
    case 'MV':
      return `${parsed.set}-${num}-M`;
    case 'L':
      return `${parsed.set}-${num}-S`;
    default:
      return cardId;
  }
}
