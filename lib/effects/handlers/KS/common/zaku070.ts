import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';

/**
 * Card 070/130 - ZAKU ABUMI (Common)
 * Chakra: 2 | Power: 4
 * Group: Sound Village | Keywords: Team Dosu
 * MAIN: Opponent gains 1 Chakra.
 *
 * Gives the opponent 1 additional chakra. This is a drawback effect on an otherwise
 * high-power card. Per FAQ: effects that benefit the opponent are MANDATORY.
 */
function handleZaku070Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  // CONFIRM popup shown to the OPPONENT asking if they want the chakra
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ZAKU070_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: false,
    selectingPlayer: opponentPlayer,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.zaku070ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-070-C', 'MAIN', handleZaku070Main);
}
