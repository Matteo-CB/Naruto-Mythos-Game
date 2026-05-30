import {
  BATTLEPASS_INFINITE_STEP_XP,
  BATTLEPASS_MAX_NAMED_XP,
  BATTLEPASS_TIER_COUNT,
  BATTLEPASS_XP_PER_TIER,
} from './constants';

export interface TierState {
  tier: number;
  xp: number;
  xpForCurrentTier: number;
  xpForNextTier: number | null;
  xpIntoCurrentTier: number;
  xpToNext: number | null;
  isMaxNamedTier: boolean;
  infiniteBoostersEarned: number;
  xpIntoCurrentInfiniteStep: number;
  xpToNextInfiniteBooster: number | null;
}

export function xpRequiredForTier(tier: number): number {
  if (tier <= 0) return 0;
  if (tier >= BATTLEPASS_TIER_COUNT) return BATTLEPASS_MAX_NAMED_XP;
  return tier * BATTLEPASS_XP_PER_TIER;
}

export function tierForXp(xp: number): number {
  if (xp <= 0) return 0;
  const naive = Math.floor(xp / BATTLEPASS_XP_PER_TIER);
  return Math.min(naive, BATTLEPASS_TIER_COUNT);
}

export function infiniteBoostersTotalForXp(xp: number): number {
  if (xp < BATTLEPASS_MAX_NAMED_XP) return 0;
  return Math.floor((xp - BATTLEPASS_MAX_NAMED_XP) / BATTLEPASS_INFINITE_STEP_XP);
}

export function computeTierState(xp: number): TierState {
  const safeXp = Math.max(0, Math.floor(xp));
  const tier = tierForXp(safeXp);
  const xpForCurrentTier = xpRequiredForTier(tier);
  const isMaxNamedTier = tier >= BATTLEPASS_TIER_COUNT;
  const xpForNextTier = isMaxNamedTier ? null : xpRequiredForTier(tier + 1);
  const xpIntoCurrentTier = safeXp - xpForCurrentTier;
  const xpToNext = xpForNextTier === null ? null : xpForNextTier - safeXp;

  const infiniteBoostersEarned = infiniteBoostersTotalForXp(safeXp);
  const xpAboveNamed = Math.max(0, safeXp - BATTLEPASS_MAX_NAMED_XP);
  const xpIntoCurrentInfiniteStep = xpAboveNamed % BATTLEPASS_INFINITE_STEP_XP;
  const xpToNextInfiniteBooster = isMaxNamedTier
    ? BATTLEPASS_INFINITE_STEP_XP - xpIntoCurrentInfiniteStep
    : null;

  return {
    tier,
    xp: safeXp,
    xpForCurrentTier,
    xpForNextTier,
    xpIntoCurrentTier,
    xpToNext,
    isMaxNamedTier,
    infiniteBoostersEarned,
    xpIntoCurrentInfiniteStep,
    xpToNextInfiniteBooster,
  };
}

export function tiersCrossed(oldXp: number, newXp: number): number[] {
  const oldTier = tierForXp(oldXp);
  const newTier = tierForXp(newXp);
  if (newTier <= oldTier) return [];
  const out: number[] = [];
  for (let t = oldTier + 1; t <= newTier; t++) out.push(t);
  return out;
}

export function infiniteBoostersDelta(oldXp: number, newXp: number): number {
  return Math.max(0, infiniteBoostersTotalForXp(newXp) - infiniteBoostersTotalForXp(oldXp));
}
