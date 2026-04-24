import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { canBeHiddenByEnemy } from '@/lib/effects/ContinuousEffects';
import { EffectEngine } from '@/lib/effects/EffectEngine';


function handleKiba026Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;

  const newState = { ...state };

  const mission = newState.activeMissions[sourceMissionIndex];
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const enemyChars = mission[enemySide];

  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  
  const nonHiddenEnemies = enemyChars.filter(c => canBeHiddenByEnemy(newState, c, opponentPlayer));

  if (nonHiddenEnemies.length === 0) {
    return { state: { ...newState, log: logAction(newState.log, newState.turn, newState.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kiba Inuzuka (026): No non-hidden enemy character in this mission to hide.',
      'game.log.effect.noTarget', { card: 'KIBA INUZUKA', id: 'KS-026-UC' }) } };
  }

  
  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'KIBA026_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.kiba026ConfirmMain',
  };
}

function handleKiba026Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  let newState = { ...state };
  const ps = { ...newState[sourcePlayer] };

  if (ps.deck.length === 0) {
    return { state: { ...newState, log: logAction(newState.log, newState.turn, newState.phase, sourcePlayer,
      'EFFECT', 'Kiba Inuzuka (026): Deck is empty, upgrade effect fizzles.',
      'game.log.effect.noTarget', { card: 'KIBA INUZUKA', id: 'KS-026-UC' }) } };
  }

  
  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'KIBA026_CONFIRM_UPGRADE',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.kiba026ConfirmUpgrade',
  };
}

export function registerKiba026Handlers(): void {
  registerEffect('KS-026-UC', 'MAIN', handleKiba026Main);
  registerEffect('KS-026-UC', 'UPGRADE', handleKiba026Upgrade);
}
