import type { CardData, GameState } from '../types';
import { isDuelCharacterPresent } from '@/lib/effects/duelUtils';

export const OROCHIMARU_NOM = 'Orochimaru';
export const SENJU_NUMEROS = [129, 131];

export function ameliorationLibreAutorisee(
  carte: Pick<CardData, 'set' | 'number'>,
  state?: GameState,
  missionIndex?: number,
): boolean {
  const numero = Number(carte.number);
  if (String(carte.set) !== 'SS' || !SENJU_NUMEROS.includes(numero)) return false;
  if (!state || missionIndex == null) return false;
  return isDuelCharacterPresent(state, missionIndex, OROCHIMARU_NOM);
}
