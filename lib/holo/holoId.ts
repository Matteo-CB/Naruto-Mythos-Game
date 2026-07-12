import type { CardData } from '@/lib/engine/types';

export const HOLO_ID_SUFFIX = '_H';

export const HOLO_ELIGIBLE_RARITIES = ['C', 'UC'] as const;
export type HoloBaseRarity = (typeof HOLO_ELIGIBLE_RARITIES)[number];

export const HOLO_DUPLICATE_XP: Record<HoloBaseRarity, number> = {
  C: 3,
  UC: 5,
};

export function isHoloId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.endsWith(HOLO_ID_SUFFIX);
}

export function holoBaseId(id: string): string {
  return isHoloId(id) ? id.slice(0, -HOLO_ID_SUFFIX.length) : id;
}

export function holoIdFor(baseId: string): string {
  return isHoloId(baseId) ? baseId : `${baseId}${HOLO_ID_SUFFIX}`;
}

export function isHoloEligibleCard(card: Pick<CardData, 'card_type' | 'rarity' | 'image_file'> | null | undefined): boolean {
  if (!card) return false;
  if (card.card_type !== 'character') return false;
  if (!card.image_file) return false;
  return (HOLO_ELIGIBLE_RARITIES as readonly string[]).includes(card.rarity);
}

export function holoDuplicateXp(rarity: string): number {
  return HOLO_DUPLICATE_XP[rarity as HoloBaseRarity] ?? 0;
}

export function decorateHoloCard<T extends CardData>(base: T): T {
  const hid = holoIdFor(base.cardId || base.id);
  return { ...base, id: hid, cardId: hid, isHolo: true };
}
