import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { getTierReward, BATTLEPASS_SEASON_SET_ID } from '@/lib/battlepass/constants';
import { withUserLock } from '@/lib/quests/userLock';
import { incrementVariant, isVariantOwned } from '@/lib/variants/inventory';

const CARD_TIERS: ReadonlySet<number> = new Set([5, 25, 50]);

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: { tier?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body', errorKey: 'battlepass.error.invalidBody' }, { status: 400 });
  }
  const tier = typeof body.tier === 'number' ? Math.floor(body.tier) : NaN;
  if (!CARD_TIERS.has(tier)) {
    return NextResponse.json({ error: 'Tier is not a card tier', errorKey: 'battlepass.error.notCardTier' }, { status: 400 });
  }

  const reward = getTierReward(tier);
  if (reward.type !== 'card' || !reward.cardId) {
    return NextResponse.json({ error: 'Reward is not a card', errorKey: 'battlepass.error.notCardReward' }, { status: 500 });
  }
  const cardId = reward.cardId;

  return withUserLock(userId, async () => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { battlepassTier: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (user.battlepassTier < tier) {
      return NextResponse.json({
        error: 'Tier not reached yet',
        errorKey: 'battlepass.error.tierNotReached',
      }, { status: 400 });
    }
    const already = await isVariantOwned(userId, cardId);
    if (already) {
      return NextResponse.json({
        error: 'Card already unlocked',
        errorKey: 'battlepass.error.alreadyUnlocked',
      }, { status: 409 });
    }

    await incrementVariant(userId, cardId);

    return NextResponse.json({
      tier,
      cardId,
      setId: BATTLEPASS_SEASON_SET_ID,
    });
  });
}
