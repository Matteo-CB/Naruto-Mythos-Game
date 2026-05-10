import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { isMovementBlockedByKurenai } from '@/lib/effects/ContinuousEffects';



function handleShizune006Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  
  if (state.activeMissions.length < 2) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Shizune (006): Only 1 mission in play, cannot move.',
      'game.log.effect.noTarget', { card: 'SHIZUNE', id: 'KS-006-UC' }) } };
  }

  
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  let hasTarget = false;
  for (let mIdx = 0; mIdx < state.activeMissions.length; mIdx++) {
    
    if (isMovementBlockedByKurenai(state, mIdx, opponentPlayer)) continue;
    const mission = state.activeMissions[mIdx];
    for (const char of mission[enemySide]) {
      if (getEffectivePower(state, char, opponentPlayer) <= 3) {
        
        const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
        const charName = topCard.name_fr;
        const hasValidDest = state.activeMissions.some((m, i) => {
          if (i === mIdx) return false;
          return !m[enemySide].some((c) => {
            if (c.instanceId === char.instanceId) return false;
            if (c.isHidden) return false;
            const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
            return cTop.name_fr === charName;
          });
        });
        if (!hasValidDest) continue;
        hasTarget = true;
        break;
      }
    }
    if (hasTarget) break;
  }

  if (!hasTarget) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Shizune (006): No enemy character with Power 3 or less in play to move.',
      'game.log.effect.noTarget', { card: 'SHIZUNE', id: 'KS-006-UC' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SHIZUNE006_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.shizune006ConfirmMain',
  };
}

function handleShizune006Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourceCard } = ctx;

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SHIZUNE006_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.shizune006ConfirmUpgrade',
  };
}

export function registerShizune006Handlers(): void {
  registerEffect('KS-006-UC', 'MAIN', handleShizune006Main);
  registerEffect('KS-006-UC', 'UPGRADE', handleShizune006Upgrade);
}
