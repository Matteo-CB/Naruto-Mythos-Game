import { getServerCardById, isExtraSetCard } from '@/lib/data/serverCards';
import { isCardPublicSync } from '@/lib/cards/reveal';
import { isHoloId } from '@/lib/holo/holoId';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { holoRarity, type HoloRarity } from '@/lib/cards/holoRarity';

export const FEATURED_MENU_MAX = 6;

export const DEFAULT_FEATURED_CARD_IDS: string[] = ['KS-141-M', 'KS-143-M', 'KS-148-M'];

export interface FeaturedMenuCard {
  id: string;
  src: string;
  rarity: HoloRarity;
}

export type FeaturedRejection = 'unknown_card' | 'not_public' | 'not_a_character' | 'no_image' | 'holo_id';

export function checkFeaturableCardId(id: string, hiddenIds: Set<string>): FeaturedRejection | null {
  if (typeof id !== 'string' || id.length === 0 || id.length > 40) return 'unknown_card';
  if (isHoloId(id)) return 'holo_id';
  const card = getServerCardById(id);
  if (!card) return 'unknown_card';
  if (card.card_type !== 'character') return 'not_a_character';
  if (!card.image_file) return 'no_image';
  if (!isCardPublicSync(id, hiddenIds)) return 'not_public';
  return null;
}

export function isFeaturableCardId(id: string, hiddenIds: Set<string>): boolean {
  return checkFeaturableCardId(id, hiddenIds) === null;
}

export function resolveFeaturedMenuCards(ids: unknown, hiddenIds: Set<string>): FeaturedMenuCard[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  const out: FeaturedMenuCard[] = [];
  for (const raw of ids) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (!isFeaturableCardId(id, hiddenIds)) continue;
    const card = getServerCardById(id);
    if (!card) continue;
    const src = isExtraSetCard(id) ? `/api/card-image/${id}` : normalizeImagePath(card.image_file);
    if (!src) continue;
    out.push({ id, src, rarity: holoRarity(card.rarity) });
    if (out.length >= FEATURED_MENU_MAX) break;
  }
  return out;
}

export function sanitizeFeaturedCardIds(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  if (input.length > FEATURED_MENU_MAX) return null;
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') return null;
    const id = raw.trim();
    if (!id || id.length > 40) return null;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}
