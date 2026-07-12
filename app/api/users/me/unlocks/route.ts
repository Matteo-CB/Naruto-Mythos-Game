import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { isAdmin } from '@/lib/auth/admins';
import { allVariantCards } from '@/lib/variants/variantPool';
import { getVariantInventory } from '@/lib/variants/inventory';
import { getForceUnlockedCardIds } from '@/lib/variants/forceUnlock';
import { getAllCards } from '@/lib/data/cardLoader';
import { isHoloEligibleCard, holoIdFor } from '@/lib/holo/holoId';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, email: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (isAdmin({ username: user.username, email: user.email })) {
    const all: Record<string, number> = {};
    for (const c of allVariantCards()) all[c.cardId] = 99;
    for (const c of getAllCards()) {
      if (isHoloEligibleCard(c)) all[holoIdFor(c.cardId)] = 99;
    }
    return NextResponse.json({ inventory: all, unlockedCardIds: Object.keys(all), admin: true });
  }

  const inventory = await getVariantInventory(userId);
  const unlockedCardIds = Array.from(new Set([...Object.keys(inventory), ...getForceUnlockedCardIds()]));
  return NextResponse.json({
    inventory,
    unlockedCardIds,
    admin: false,
  });
}
