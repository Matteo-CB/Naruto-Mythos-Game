import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { computeTierState } from '@/lib/battlepass/computeTier';
import { getOwnedVariantIds } from '@/lib/variants/inventory';
import {
  BATTLEPASS_TIER_COUNT,
  BATTLEPASS_XP_PER_TIER,
  BATTLEPASS_INFINITE_STEP_XP,
  BATTLEPASS_MAX_NAMED_XP,
  BATTLEPASS_SEASON_SET_ID,
  getTierReward,
} from '@/lib/battlepass/constants';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      battlepassXp: true,
      battlepassTier: true,
      infiniteBoostersGranted: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const state = computeTierState(user.battlepassXp);
  const unlockedSet = await getOwnedVariantIds(session.user.id);

  const tiers = Array.from({ length: BATTLEPASS_TIER_COUNT }, (_, i) => {
    const tier = i + 1;
    const reward = getTierReward(tier);
    const reached = tier <= state.tier;
    const cardOwned = reward.cardId ? unlockedSet.has(reward.cardId) : undefined;
    const cardClaimable = reward.type === 'card' && reached && cardOwned === false;
    return {
      tier,
      xpRequired: tier * BATTLEPASS_XP_PER_TIER,
      reward: {
        type: reward.type,
        setId: reward.setId,
        cardId: reward.cardId,
        cardOwned,
        cardClaimable,
      },
      reached,
    };
  });

  return NextResponse.json({
    season: {
      setId: BATTLEPASS_SEASON_SET_ID,
    },
    xp: state.xp,
    tier: state.tier,
    xpForCurrentTier: state.xpForCurrentTier,
    xpForNextTier: state.xpForNextTier,
    xpIntoCurrentTier: state.xpIntoCurrentTier,
    xpToNext: state.xpToNext,
    isMaxNamedTier: state.isMaxNamedTier,
    infiniteBoostersEarned: state.infiniteBoostersEarned,
    xpIntoCurrentInfiniteStep: state.xpIntoCurrentInfiniteStep,
    xpToNextInfiniteBooster: state.xpToNextInfiniteBooster,
    infiniteStepXp: BATTLEPASS_INFINITE_STEP_XP,
    maxNamedXp: BATTLEPASS_MAX_NAMED_XP,
    tierCount: BATTLEPASS_TIER_COUNT,
    tiers,
  });
}
