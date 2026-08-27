import { SEASON_CHIBI_ORDER, SEASON_LAST_CHIBI } from '@/lib/variants/seasonChibis';

export const SEASON_SET_ID = 'SS';
export const SEASON_COMPANION_SET_ID = 'KS';

export const TIERS_PER_DOUBLE_BOOSTER = 5;
export const TIERS_PER_CHIBI = 4;

export const SEASON_TIER_COUNT = (SEASON_CHIBI_ORDER.length + 1) * TIERS_PER_CHIBI;

export interface TierRewardPlan {
  tier: number;
  boosterSetIds: string[];
  cardId?: string;
}

export function isDoubleBoosterTier(tier: number): boolean {
  return tier > 0 && tier % TIERS_PER_DOUBLE_BOOSTER === 0;
}

export function isChibiTier(tier: number): boolean {
  return tier > 0 && tier % TIERS_PER_CHIBI === 0 && tier <= SEASON_TIER_COUNT;
}

export function chibiOfTier(tier: number): string | undefined {
  if (!isChibiTier(tier)) return undefined;
  if (tier === SEASON_TIER_COUNT) return SEASON_LAST_CHIBI;
  return SEASON_CHIBI_ORDER[tier / TIERS_PER_CHIBI - 1];
}

export function planTier(tier: number): TierRewardPlan {
  const boosterSetIds = [SEASON_SET_ID];
  if (isDoubleBoosterTier(tier)) boosterSetIds.push(SEASON_COMPANION_SET_ID);
  return { tier, boosterSetIds, cardId: chibiOfTier(tier) };
}

export function planSeason(): TierRewardPlan[] {
  const plan: TierRewardPlan[] = [];
  for (let tier = 1; tier <= SEASON_TIER_COUNT; tier += 1) plan.push(planTier(tier));
  return plan;
}

export function seasonCardIds(): string[] {
  return planSeason().map((t) => t.cardId).filter((id): id is string => !!id);
}
