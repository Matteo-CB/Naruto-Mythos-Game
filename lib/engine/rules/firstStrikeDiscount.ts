import type { CardData, GameState, PlayerID } from '../types';
import { isFirstCardPlayedThisRound } from './firstStrike';

export const TENTEN_021_ID = 'SS-021-C';
export const TENTEN_021_REDUCTION = 1;

export function reductionPremiereFrappe(
  state: GameState,
  player: PlayerID,
  card: Pick<CardData, 'id' | 'set' | 'number'>,
): number {
  const estTenten021 = card.id === TENTEN_021_ID
    || (String(card.set) === 'SS' && Number(card.number) === 21);
  if (!estTenten021) return 0;
  return isFirstCardPlayedThisRound(state, player) ? TENTEN_021_REDUCTION : 0;
}
