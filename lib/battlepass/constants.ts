import {
  BATTLEPASS_TIER_5_CARD,
  BATTLEPASS_TIER_25_CARD,
  BATTLEPASS_TIER_50_CARD,
  DUPLICATE_XP_BY_RARITY,
} from '@/lib/variants/constants';

export const BATTLEPASS_TIER_COUNT = 50;
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
}

export const BATTLEPASS_SEASON_SET_ID = 'KS';

export function getTierReward(tier: number): TierReward {
  if (tier === 5) {
    return { type: 'card', setId: BATTLEPASS_SEASON_SET_ID, cardId: BATTLEPASS_TIER_5_CARD };
  }
  if (tier === 25) {
    return { type: 'card', setId: BATTLEPASS_SEASON_SET_ID, cardId: BATTLEPASS_TIER_25_CARD };
  }
  if (tier === 50) {
    return { type: 'card', setId: BATTLEPASS_SEASON_SET_ID, cardId: BATTLEPASS_TIER_50_CARD };
  }
  return { type: 'booster', setId: BATTLEPASS_SEASON_SET_ID };
}

export { DUPLICATE_XP_BY_RARITY };
