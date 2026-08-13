import { prisma } from '@/lib/db/prisma';
import { getCardById } from '@/lib/data/cardIndex';
import { isSetAvailable, isSetRevealing } from '@/lib/data/sets/registry';
import { holoBaseId } from '@/lib/holo/holoId';

// Server-only helper set for the "card reveal" feature. Revealing-set cards are PUBLIC by
// default; an admin can explicitly HIDE (not-yet-reveal) specific cards, which are then hidden
// from every non-admin/non-tester surface (collection, deck builder, game, images, tournaments).
// Released-set cards are always public; coming-soon-set cards are never public.

let cache: { ids: Set<string>; time: number } | null = null;
const TTL_MS = 30_000;

// Local-only escape hatch: with REVEAL_EVERYTHING=1 in the environment, every card of every set
// is treated as public and every set is delivered, so a developer can exercise unreleased content
// without touching the shared database. Never set it on the production host.
export function revealsEverything(): boolean {
  return process.env.REVEAL_EVERYTHING === '1' && process.env.NODE_ENV === 'development';
}

export async function getHiddenCardIds(): Promise<Set<string>> {
  if (revealsEverything()) return new Set<string>();
  if (cache && Date.now() - cache.time < TTL_MS) return cache.ids;
  try {
    const rows = await prisma.hiddenCard.findMany({ select: { cardId: true } });
    const ids = new Set(rows.map((r) => r.cardId));
    cache = { ids, time: Date.now() };
    return ids;
  } catch (e) {
    // Fail open to the last known set (or empty = all public): a DB/client hiccup must not
    // break public surfaces like the home page. Revealing-set cards are public by default.
    console.warn('[reveal] getHiddenCardIds failed:', e instanceof Error ? e.message : e);
    return cache?.ids ?? new Set<string>();
  }
}

export function invalidateRevealCache(): void {
  cache = null;
}

// Synchronous visibility check given an already-loaded hidden-id set. `cardId` may be a holo
// id; it is reduced to its base id for the lookup.
export function isCardPublicSync(cardId: string, hiddenIds: Set<string>): boolean {
  const baseId = holoBaseId(cardId);
  const card = getCardById(baseId);
  if (!card) return false;
  if (revealsEverything()) return true;
  if (isSetAvailable(card.set)) return true;
  if (isSetRevealing(card.set)) return !hiddenIds.has(baseId);
  return false;
}

export async function isCardPublic(cardId: string): Promise<boolean> {
  return isCardPublicSync(cardId, await getHiddenCardIds());
}

// A card is restricted (hidden from normal players) when it is not public.
export async function isCardRestricted(cardId: string): Promise<boolean> {
  return !(await isCardPublic(cardId));
}

// True if a card belongs to a set that could ever be restricted (revealing set).
export function isCardFromRevealingSet(cardId: string): boolean {
  const card = getCardById(holoBaseId(cardId));
  return !!card && isSetRevealing(card.set);
}
