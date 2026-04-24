import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { canBeHiddenByEnemy } from '@/lib/effects/ContinuousEffects';
import { EffectEngine } from '@/lib/effects/EffectEngine';


function handleAkamaru029Main(ctx: EffectContext): EffectResult {
  
  
  const state = ctx.state;
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Akamaru (029): Can be played as an upgrade over Kiba Inuzuka (continuous).',
    'game.log.effect.continuous',
    { card: 'AKAMARU', id: 'KS-029-UC' },
  );
  return { state: { ...state, log } };
}

function handleAkamaru029Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const enemyChars = mission[enemySide];

  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  
  const nonHiddenEnemies = enemyChars.filter(c => canBeHiddenByEnemy(state, c, opponentPlayer));

  if (nonHiddenEnemies.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Akamaru (029): No non-hidden enemy character in this mission to hide (upgrade effect).',
      'game.log.effect.noTarget', { card: 'AKAMARU', id: 'KS-029-UC' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'AKAMARU029_CONFIRM_UPGRADE',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.akamaru029ConfirmUpgrade',
  };
}

export function registerAkamaru029Handlers(): void {
  registerEffect('KS-029-UC', 'MAIN', handleAkamaru029Main);
  registerEffect('KS-029-UC', 'UPGRADE', handleAkamaru029Upgrade);
}
