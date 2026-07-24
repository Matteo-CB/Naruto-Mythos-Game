import type { CardData } from '@/lib/engine/types';
import { getAllCards } from '@/lib/data/cardLoader';
import { compareBySetOrder } from '@/lib/cards/order';

const BASE_RARITIES = new Set(['C', 'UC', 'R', 'S', 'M', 'MMS']);

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

function preferredSlug(card: CardData): string {
  const base = slugify(card.name_en || card.name_fr || card.id);
  const suffix = BASE_RARITIES.has(card.rarity) ? '' : '-' + card.rarity.toLowerCase();
  return `${base}-${card.number}${suffix}`;
}

let idToSlug: Map<string, string> | null = null;
let slugToId: Map<string, string> | null = null;

function build(): void {
  idToSlug = new Map();
  slugToId = new Map();

  for (const card of getAllCards().slice().sort(compareBySetOrder)) {
    const preferred = preferredSlug(card);
    let slug = preferred;
    let n = 2;
    while (slugToId.has(slug)) {
      slug = `${preferred}-${n}`;
      n++;
    }

    idToSlug.set(card.id, slug);
    slugToId.set(slug, card.id);
  }
}

export function resetSlugCache(): void {
  idToSlug = null;
  slugToId = null;
}

export function cardIdToSlug(id: string): string {
  if (!idToSlug) build();
  return idToSlug!.get(id) ?? slugify(id);
}

export function slugToCardId(slug: string): string | undefined {
  if (!slugToId) build();
  return slugToId!.get(slug);
}
