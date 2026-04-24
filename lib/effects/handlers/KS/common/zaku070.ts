import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';


function handleZaku070Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  
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
