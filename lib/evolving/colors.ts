import { EVOLVING_MAX_POINTS } from './constants';

export type EvolvingBracket = 0 | 1 | 2 | 3 | 4 | 5;

const COLORS_BY_BRACKET: Record<EvolvingBracket, string> = {
  0: '#e8e8f0',
  1: '#5fb8d8',
  2: '#9070d0',
  3: '#c4a35a',
  4: '#e08040',
  5: '#b33e3e',
};

export function getEvolvingBracket(points: number): EvolvingBracket | null {
  if (typeof points !== 'number') return null;
  if (!Number.isFinite(points)) return null;
  if (points < 0) return null;
  if (points > EVOLVING_MAX_POINTS) return null;
  const bracket = Math.ceil(points) as EvolvingBracket;
  if (bracket < 0 || bracket > EVOLVING_MAX_POINTS) return null;
  return bracket;
}

export function getEvolvingColorForPoints(points: number): string | null {
  const bracket = getEvolvingBracket(points);
  if (bracket === null) return null;
  return COLORS_BY_BRACKET[bracket];
}

export function getEvolvingColorForBracket(bracket: EvolvingBracket): string {
  return COLORS_BY_BRACKET[bracket];
}
