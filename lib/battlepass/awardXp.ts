import { prisma } from '@/lib/db/prisma';
import { computeTierState, tiersCrossed, infiniteBoostersDelta } from './computeTier';
import { getTierReward, BATTLEPASS_SEASON_SET_ID } from './constants';
import { grantBoosters } from '@/lib/boosters/openBooster';
import { emitQuestEvent } from '@/lib/quests/hooks';

export interface AwardXpResult {
  userId: string;
  oldXp: number;
  newXp: number;
  oldTier: number;
  newTier: number;
  tiersAutoClaimed: number[];
  boostersGranted: number;
  cardsUnlocked: string[];
  infiniteBoostersFromTail: number;
}

export async function awardXp(userId: string, xp: number): Promise<AwardXpResult> {
  if (xp <= 0) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { battlepassXp: true, battlepassTier: true },
    });
    const safeXp = user?.battlepassXp ?? 0;
    return {
      userId,
      oldXp: safeXp,
      newXp: safeXp,
      oldTier: user?.battlepassTier ?? 0,
      newTier: user?.battlepassTier ?? 0,
      tiersAutoClaimed: [],
      boostersGranted: 0,
      cardsUnlocked: [],
      infiniteBoostersFromTail: 0,
    };
  }

  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { battlepassXp: true, battlepassTier: true, infiniteBoostersGranted: true },
  });
  if (!before) {
    throw new Error(`awardXp: unknown user ${userId}`);
  }

  const oldXp = before.battlepassXp;
  const newXp = oldXp + Math.floor(xp);
  const oldState = computeTierState(oldXp);
  const newState = computeTierState(newXp);
  const crossed = tiersCrossed(oldXp, newXp);
  const newInfinite = infiniteBoostersDelta(oldXp, newXp);

  await prisma.user.update({
    where: { id: userId },
    data: {
      battlepassXp: newXp,
      battlepassTier: newState.tier,
      infiniteBoostersGranted: (before.infiniteBoostersGranted ?? 0) + newInfinite,
    },
  });

  let boostersGranted = 0;
  const cardsUnlocked: string[] = [];

  for (const tier of crossed) {
    const reward = getTierReward(tier);
    if (reward.type === 'booster') {
      await grantBoosters(userId, reward.setId, 1);
      boostersGranted += 1;
    }
  }

  if (newInfinite > 0) {
    await grantBoosters(userId, BATTLEPASS_SEASON_SET_ID, newInfinite);
    boostersGranted += newInfinite;
  }

  for (const t of crossed) {
    emitQuestEvent('battlepass.tier.reached', userId, { tier: t });
  }

  return {
    userId,
    oldXp,
    newXp,
    oldTier: oldState.tier,
    newTier: newState.tier,
    tiersAutoClaimed: crossed,
    boostersGranted,
    cardsUnlocked,
    infiniteBoostersFromTail: newInfinite,
  };
}
