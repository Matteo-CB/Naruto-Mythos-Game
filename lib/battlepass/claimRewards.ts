import { getTierReward, type TierReward } from './constants';
import { computeTierState } from './computeTier';

export interface ClaimableSummary {
  unclaimedTiers: number[];
  rewards: Array<TierReward & { tier: number }>;
  totalBoosters: number;
  totalCards: string[];
}

export function computeClaimable(
  currentXp: number,
  claimedTiers: ReadonlyArray<number>,
): ClaimableSummary {
  const state = computeTierState(currentXp);
  const claimedSet = new Set(claimedTiers);
  const unclaimedTiers: number[] = [];
  const rewards: Array<TierReward & { tier: number }> = [];
  let totalBoosters = 0;
  const totalCards: string[] = [];

  for (let tier = 1; tier <= state.tier; tier++) {
    if (claimedSet.has(tier)) continue;
    unclaimedTiers.push(tier);
    const reward = getTierReward(tier);
    rewards.push({ ...reward, tier });
    totalBoosters += reward.boosterSetIds.length;
    if (reward.cardId) totalCards.push(reward.cardId);
  }

  return { unclaimedTiers, rewards, totalBoosters, totalCards };
}
