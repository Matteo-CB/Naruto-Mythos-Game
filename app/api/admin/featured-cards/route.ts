import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { prisma } from '@/lib/db/prisma';
import { ensureSetConfigLoaded, getFeaturedMenuCardIds, reloadSetConfig } from '@/lib/data/setConfigServer';
import { getHiddenCardIds, invalidateRevealCache } from '@/lib/cards/reveal';
import { ensureServerCards } from '@/lib/data/serverCards';
import {
  FEATURED_MENU_MAX,
  DEFAULT_FEATURED_CARD_IDS,
  checkFeaturableCardId,
  sanitizeFeaturedCardIds,
} from '@/lib/cards/featuredMenu';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  ensureServerCards();
  await ensureSetConfigLoaded();
  return NextResponse.json({
    cardIds: getFeaturedMenuCardIds(),
    max: FEATURED_MENU_MAX,
    defaults: DEFAULT_FEATURED_CARD_IDS,
  });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ code: 'invalid' }, { status: 400 });

  const cardIds = sanitizeFeaturedCardIds((body as { cardIds?: unknown }).cardIds);
  if (cardIds === null) {
    const raw = (body as { cardIds?: unknown }).cardIds;
    const code = Array.isArray(raw) && raw.length > FEATURED_MENU_MAX ? 'too_many' : 'invalid';
    return NextResponse.json({ code }, { status: 400 });
  }

  ensureServerCards();
  await ensureSetConfigLoaded();
  invalidateRevealCache();
  const hidden = await getHiddenCardIds();

  for (const id of cardIds) {
    const rejection = checkFeaturableCardId(id, hidden);
    if (rejection) return NextResponse.json({ code: rejection, cardId: id }, { status: 400 });
  }

  await prisma.siteSettings.upsert({
    where: { key: 'global' },
    update: { featuredMenuCards: cardIds },
    create: { key: 'global', featuredMenuCards: cardIds },
  });
  await reloadSetConfig();

  return NextResponse.json({ success: true, cardIds });
}
