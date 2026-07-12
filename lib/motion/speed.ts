import { useSettingsStore } from '@/stores/settingsStore';

export type MotionEventType =
  | 'draw'
  | 'play'
  | 'playHidden'
  | 'reveal'
  | 'upgrade'
  | 'move'
  | 'defeat'
  | 'token'
  | 'chakra'
  | 'edge'
  | 'missionScore'
  | 'turnBanner';

export const BASE_DURATIONS_MS: Record<MotionEventType, number> = {
  draw: 350,
  play: 550,
  playHidden: 450,
  reveal: 800,
  upgrade: 600,
  move: 500,
  defeat: 700,
  token: 300,
  chakra: 300,
  edge: 450,
  missionScore: 1200,
  turnBanner: 800,
};

export const FAST_MULTIPLIER = 0.5;

export function computeMotionMs(
  type: MotionEventType,
  opts: { animationsEnabled: boolean; fastAnimations: boolean },
): number {
  if (!opts.animationsEnabled) return 0;
  const base = BASE_DURATIONS_MS[type];
  return opts.fastAnimations ? Math.round(base * FAST_MULTIPLIER) : base;
}

export function motionMs(type: MotionEventType): number {
  if (typeof window === 'undefined') return BASE_DURATIONS_MS[type];
  const s = useSettingsStore.getState();
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  return computeMotionMs(type, {
    animationsEnabled: s.animationsEnabled && !reduced,
    fastAnimations: s.fastAnimations,
  });
}
