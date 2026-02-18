import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 070/130 - ZAKU ABUMI (Common)
 * Chakra: 2 | Power: 4
 * Group: Sound Village | Keywords: Team Dosu
 * MAIN: Opponent gains 1 Chakra.
 *
 * Gives the opponent 1 additional chakra. This is a drawback effect on an otherwise
 * high-power card. The effect is mandatory (implicit from wording - no "you can").
 */
function handleZaku070Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  const newState = { ...state };
  const opponentState = { ...newState[opponentPlayer] };
  opponentState.chakra = opponentState.chakra + 1;
  newState[opponentPlayer] = opponentState;

  return { state: newState };
}

export function registerHandler(): void {
  registerEffect('070/130', 'MAIN', handleZaku070Main);
}
