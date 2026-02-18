import type { CardData } from '../engine/types';

const CARD_BACK_IMAGE = '/images/card-back.webp';
const SILHOUETTE_PLACEHOLDER = '/images/silhouette.webp';

export function getCardImagePath(card: CardData): string | null {
  if (card.image_file) {
    return card.image_file;
  }
  return null;
}

export function getCardBackImage(): string {
  return CARD_BACK_IMAGE;
}

export function getSilhouettePlaceholder(): string {
  return SILHOUETTE_PLACEHOLDER;
}

export function hasImage(card: CardData): boolean {
  return !!card.image_file;
}

export function isPlayable(card: CardData): boolean {
  return card.has_visual;
}
