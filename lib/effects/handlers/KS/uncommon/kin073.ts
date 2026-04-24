import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { canBeHiddenByEnemy } from '@/lib/effects/ContinuousEffects';



function handleKin073Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const playerState = state[sourcePlayer];

  
  if (playerState.hand.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET', 'Kin Tsuchi (073): No cards in hand to discard.',
      'game.log.effect.noTarget', { card: 'KIN TSUCHI', id: 'KS-073-UC' }) } };
  }

  
  const enemySide073 = opponentPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const hasValidTarget = state.activeMissions.some((mission) =>
    mission[enemySide073].some(
      (char) => canBeHiddenByEnemy(state, char, opponentPlayer) && getEffectivePower(state, char, opponentPlayer) <= 4,
    ),
  );

  if (!hasValidTarget) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET', 'Kin Tsuchi (073): No non-hidden enemy with Power 4 or less in play.',
      'game.log.effect.noTarget', { card: 'KIN TSUCHI', id: 'KS-073-UC' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIN073_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId, missionIndex: sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.kin073ConfirmMain',
  };
}

function handleKin073Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playerState = state[sourcePlayer];

  
  if (playerState.deck.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET', 'Kin Tsuchi (073): Deck is empty, cannot place hidden character.',
      'game.log.effect.noTarget', { card: 'KIN TSUCHI', id: 'KS-073-UC' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIN073_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.kin073ConfirmUpgrade',
  };
}

export function registerKin073Handlers(): void {
  registerEffect('KS-073-UC', 'MAIN', handleKin073Main);
  registerEffect('KS-073-UC', 'UPGRADE', handleKin073Upgrade);
}
