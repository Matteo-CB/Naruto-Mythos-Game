import { BATTLEPASS_INFINITE_STEP_XP, BATTLEPASS_MAX_NAMED_XP } from './constants';
import { infiniteBoostersDelta, infiniteBoostersTotalForXp } from './computeTier';

export interface PostFiftyAward {
  newBoosters: number;
  totalBoostersAfter: number;
}

export function computePostFiftyAward(oldXp: number, newXp: number): PostFiftyAward {
  return {
    newBoosters: infiniteBoostersDelta(oldXp, newXp),
    totalBoostersAfter: infiniteBoostersTotalForXp(newXp),
  };
}

export { BATTLEPASS_INFINITE_STEP_XP, BATTLEPASS_MAX_NAMED_XP };
