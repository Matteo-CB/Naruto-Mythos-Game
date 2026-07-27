import { NextResponse } from 'next/server';
import { ensureSetConfigLoaded, getFeaturedMenuCardIds } from '@/lib/data/setConfigServer';
import { getHiddenCardIds } from '@/lib/cards/reveal';
import { ensureServerCards } from '@/lib/data/serverCards';
import { DEFAULT_FEATURED_CARD_IDS, resolveFeaturedMenuCards } from '@/lib/cards/featuredMenu';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    ensureServerCards();
    await ensureSetConfigLoaded();
    const hidden = await getHiddenCardIds();
    let cards = resolveFeaturedMenuCards(getFeaturedMenuCardIds(), hidden);
    if (cards.length === 0) cards = resolveFeaturedMenuCards(DEFAULT_FEATURED_CARD_IDS, hidden);
    return NextResponse.json(
      { cards },
      { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' } },
    );
  } catch {
    try {
      ensureServerCards();
      const hidden = await getHiddenCardIds();
      return NextResponse.json({ cards: resolveFeaturedMenuCards(DEFAULT_FEATURED_CARD_IDS, hidden) });
    } catch {
      return NextResponse.json({ cards: [] });
    }
  }
}
