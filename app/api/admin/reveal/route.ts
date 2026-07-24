import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { prisma } from '@/lib/db/prisma';
import { getServerAllCards } from '@/lib/data/serverCards';
import { isSetRevealing } from '@/lib/data/sets/registry';
import { getHiddenCardIds, invalidateRevealCache } from '@/lib/cards/reveal';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const hidden = await getHiddenCardIds();
  const cards = getServerAllCards()
    .filter((c) => isSetRevealing(c.set))
    .map((c) => ({
      id: c.id,
      set: c.set,
      number: c.number,
      rarity: c.rarity,
      name: c.name_en ?? c.name_fr ?? c.id,
      title: c.title_en ?? c.title_fr ?? '',
      revealed: !hidden.has(c.id),
    }))
    .sort((a, b) => a.set.localeCompare(b.set) || a.number - b.number || a.rarity.localeCompare(b.rarity));
  return NextResponse.json({ cards });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const revealingIds = new Set(getServerAllCards().filter((c) => isSetRevealing(c.set)).map((c) => c.id));

  if (body.all === 'reveal' || body.all === 'hide') {
    const ids = [...revealingIds];
    if (body.all === 'reveal') {
      await prisma.hiddenCard.deleteMany({ where: { cardId: { in: ids } } });
    } else {
      for (const id of ids) {
        await prisma.hiddenCard.upsert({ where: { cardId: id }, update: {}, create: { cardId: id } });
      }
    }
    invalidateRevealCache();
    return NextResponse.json({ success: true });
  }

  const { cardId, revealed } = body;
  if (typeof cardId !== 'string' || typeof revealed !== 'boolean' || !revealingIds.has(cardId)) {
    return NextResponse.json({ error: 'Invalid card' }, { status: 400 });
  }
  if (revealed) {
    await prisma.hiddenCard.deleteMany({ where: { cardId } });
  } else {
    await prisma.hiddenCard.upsert({ where: { cardId }, update: {}, create: { cardId } });
  }
  invalidateRevealCache();
  return NextResponse.json({ success: true });
}
