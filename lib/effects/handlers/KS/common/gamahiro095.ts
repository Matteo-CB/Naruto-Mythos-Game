import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';


function handleGamahiro095Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  if (!mission) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Gamahiro (095): Mission not found.', 'game.log.effect.noTarget', { card: 'GAMAHIRO', id: 'KS-095-C' }) } };
  }
  const friendlyChars =
    sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

  
  const hasFriendly = friendlyChars.some(
    (char) => char.instanceId !== sourceCard.instanceId,
  );

  if (!hasFriendly) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Gamahiro (095): No other friendly character in this mission.',
      'game.log.effect.noTarget', { card: 'GAMAHIRO', id: 'KS-095-C' }) } };
  }

  
  if (state[sourcePlayer].deck.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Gamahiro (095): Deck is empty, cannot draw.',
      'game.log.effect.noTarget', { card: 'GAMAHIRO', id: 'KS-095-C' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'GAMAHIRO095_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Gamahiro (095) MAIN: Draw 1 card (friendly character present).',
    descriptionKey: 'game.effect.desc.gamahiro095ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-095-C', 'MAIN', handleGamahiro095Main);
}
