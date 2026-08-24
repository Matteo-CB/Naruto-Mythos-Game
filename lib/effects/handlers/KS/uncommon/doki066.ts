import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { missionADuSonQuatre } from '@/lib/effects/soundFourCount';



function handleDoki066Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  void friendlySide;

  const aDuSonQuatre = missionADuSonQuatre(state, sourcePlayer, sourceMissionIndex, ctx.sourceCard.instanceId);

  if (!aDuSonQuatre) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      'Doki (066): No friendly Sound Four character in this mission. Cannot steal chakra.',
      'game.log.effect.noTarget',
      { card: 'DOKI', id: 'KS-066-UC' },
    );
    return { state: { ...state, log } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'DOKI066_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.doki066ConfirmMain',
  };
}

export function registerDoki066Handlers(): void {
  registerEffect('KS-066-UC', 'MAIN', handleDoki066Main);
  
}
