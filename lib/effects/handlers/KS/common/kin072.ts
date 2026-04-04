import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 072/130 - KIN TSUCHI (Common)
 * Chakra: 1 | Power: 3
 * Group: Sound Village | Keywords: Team Dosu
 * MAIN: Opponent draws a card.
 *
 * Makes the opponent draw 1 card from their deck. This is a drawback effect on an otherwise
 * efficient card. Per FAQ: effects that benefit the opponent are MANDATORY.
 */
function handleKin072Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  // Check if opponent has cards to draw
  if (state[opponentPlayer].deck.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kin Tsuchi (072): Opponent has no cards to draw.',
      'game.log.effect.noTarget',
      { card: 'KIN TSUCHI', id: 'KS-072-C' },
    );
    return { state: { ...state, log } };
  }

  // CONFIRM popup shown to the OPPONENT asking if they want to draw
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIN072_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: false,
    selectingPlayer: opponentPlayer,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.kin072ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-072-C', 'MAIN', handleKin072Main);
}
