import type { CardData, GameState, PlayerID } from '@/lib/engine/types';
import { logAction } from '@/lib/engine/utils/gameLog';

export function envoyerLesCartesRegardeesAuFond(
  state: GameState,
  player: PlayerID,
  profondeur: number,
  sourceNom: string,
  sourceId: string,
): GameState {
  const deck = [...(state[player].deck as unknown as CardData[])];
  const regardees = deck.slice(0, profondeur);
  if (regardees.length === 0) return state;

  for (let i = regardees.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [regardees[i], regardees[j]] = [regardees[j], regardees[i]];
  }

  return {
    ...state,
    [player]: {
      ...state[player],
      deck: [...deck.slice(profondeur), ...regardees] as unknown as GameState['player1']['deck'],
    },
    log: logAction(state.log, state.turn, state.phase, player, 'EFFECT',
      `${sourceNom} (${sourceId}): the ${regardees.length} cards looked at go randomly to the bottom of the deck.`,
      'game.log.effect.ssDeckSearchBottom',
      { card: sourceNom, id: sourceId, amount: String(regardees.length) }),
  };
}
