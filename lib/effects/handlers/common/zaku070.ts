import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

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

  const log = logAction(
    newState.log,
    newState.turn,
    newState.phase,
    sourcePlayer,
    'EFFECT_CHAKRA',
    `Zaku Abumi (070): Opponent gains 1 Chakra.`,
    'game.log.effect.oppGainChakra',
    { card: 'Zaku Abumi', id: '070/130', amount: '1' },
  );

  return { state: { ...newState, log } };
}

export function registerHandler(): void {
  registerEffect('070/130', 'MAIN', handleZaku070Main);
}
