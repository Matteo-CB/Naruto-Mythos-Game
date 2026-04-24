import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { isMovementBlockedByKurenai } from '@/lib/effects/ContinuousEffects';



function handleKidomaru060Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  
  if (state.activeMissions.length < 2) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kidômaru (060): Only 1 mission in play, cannot move.',
      'game.log.effect.noTarget', { card: 'KIDÔMARU', id: 'KS-060-UC' }) } };
  }

  const mission = state.activeMissions[sourceCard.missionIndex];
  if (!mission) {
    return { state };
  }

  
  let hasMovable = false;
  for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
    const charController = mission.player1Characters.some(c => c.instanceId === char.instanceId) ? 'player1' : 'player2';
    
    if (isMovementBlockedByKurenai(state, sourceCard.missionIndex, charController as import('@/lib/engine/types').PlayerID)) continue;
    
    const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
    const charName = topCard.name_fr;
    const ctrlSide: 'player1Characters' | 'player2Characters' = charController === 'player1' ? 'player1Characters' : 'player2Characters';
    
    const hasValidDest = char.isHidden || state.activeMissions.some((m, i) => {
      if (i === sourceCard.missionIndex) return false;
      return !m[ctrlSide].some((c) => {
        if (c.instanceId === char.instanceId) return false;
        if (c.isHidden) return false;
        const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
        return cTop.name_fr === charName;
      });
    });
    if (hasValidDest) { hasMovable = true; break; }
  }

  if (!hasMovable) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kidômaru (060): No character in this mission can be moved.',
      'game.log.effect.noTarget', { card: 'KIDÔMARU', id: 'KS-060-UC' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIDOMARU060_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.kidomaru060ConfirmMain',
  };
}

function handleKidomaru060Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  
  const enemySide = sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const enemyPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
      if (getEffectivePower(state, char, enemyPlayer) <= 1) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kidômaru (060) AMBUSH: No enemy character with Power 1 or less in play.',
      'game.log.effect.noTarget',
      { card: 'KIDÔMARU', id: 'KS-060-UC' },
    );
    return { state: { ...state, log } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIDOMARU060_CONFIRM_AMBUSH',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.kidomaru060ConfirmAmbush',
  };
}

export function registerKidomaru060Handlers(): void {
  registerEffect('KS-060-UC', 'MAIN', handleKidomaru060Main);
  registerEffect('KS-060-UC', 'AMBUSH', handleKidomaru060Ambush);
}
