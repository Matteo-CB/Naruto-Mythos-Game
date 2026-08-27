import { DUPLICATE_XP_BY_RARITY } from '@/lib/variants/constants';
import {
  SEASON_SET_ID,
  SEASON_COMPANION_SET_ID,
  SEASON_TIER_COUNT,
  planTier,
} from './season';

export const BATTLEPASS_TIER_COUNT = SEASON_TIER_COUNT;
export const BATTLEPASS_XP_PER_TIER = 200;
export const BATTLEPASS_MAX_NAMED_XP = BATTLEPASS_TIER_COUNT * BATTLEPASS_XP_PER_TIER;
export const BATTLEPASS_INFINITE_STEP_XP = 500;

export const QUEST_XP_BY_LEVEL: Record<1 | 2 | 3 | 4, number> = {
  1: 25,
  2: 60,
  3: 120,
  4: 200,
};

export const TOURNAMENT_WIN_FALLBACK_XP = QUEST_XP_BY_LEVEL[4];

export type TierRewardType = 'booster' | 'card';

export interface TierReward {
  type: TierRewardType;
  setId: string;
  cardId?: string;
  boosterSetIds: string[];
}

export const BATTLEPASS_SEASON_SET_ID = SEASON_SET_ID;
export const BATTLEPASS_COMPANION_SET_ID = SEASON_COMPANION_SET_ID;

export function getTierReward(tier: number): TierReward {
  const plan = planTier(tier);
  return {
    type: plan.cardId ? 'card' : 'booster',
    setId: SEASON_SET_ID,
    cardId: plan.cardId,
    boosterSetIds: plan.boosterSetIds,
  };
}

export { DUPLICATE_XP_BY_RARITY };
