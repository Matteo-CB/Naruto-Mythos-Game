import { getEvolvingColorForPoints, getEvolvingBracket, type EvolvingBracket } from './colors';
import { EVOLVING_MAX_POINTS } from './constants';

export type HoloIntensity = 'subtle' | 'normal' | 'strong';

export interface HoloDecision {
  active: boolean;
  bracket: EvolvingBracket | null;
  color: string | null;
  intensityClass: string;
  zeroPulse: boolean;
}

export function decideHolo(input: {
  points: number;
  enabled?: boolean;
  intensity?: HoloIntensity;
}): HoloDecision {
  const { points, enabled, intensity = 'normal' } = input;

  if (enabled === false) {
    return { active: false, bracket: null, color: null, intensityClass: '', zeroPulse: false };
  }

  if (typeof points !== 'number' || !Number.isFinite(points)) {
    return { active: false, bracket: null, color: null, intensityClass: '', zeroPulse: false };
  }

  if (points < 0 || points > EVOLVING_MAX_POINTS) {
    return { active: false, bracket: null, color: null, intensityClass: '', zeroPulse: false };
  }

  const bracket = getEvolvingBracket(points);
  const color = getEvolvingColorForPoints(points);
  if (bracket === null || color === null) {
    return { active: false, bracket: null, color: null, intensityClass: '', zeroPulse: false };
  }

  return {
    active: true,
    bracket,
    color,
    intensityClass: `holo-evolving--${intensity}`,
    zeroPulse: bracket === 0,
  };
}
