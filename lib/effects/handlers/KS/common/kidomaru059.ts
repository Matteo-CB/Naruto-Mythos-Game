import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { isMovementBlockedByKurenai } from '@/lib/effects/ContinuousEffects';


function handleKidomaru059Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  
  let soundFourMissionCount = 0;
  for (const mission of state.activeMissions) {
    const hasSoundFour = mission[friendlySide].some((char) => {
      if (char.instanceId === ctx.sourceCard.instanceId) return false;
      if (char.isHidden) return false; // Hidden chars are anonymous - can't identify keyword
      const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
      return topCard.keywords && topCard.keywords.includes('Sound Four');
    });
    if (hasSoundFour) soundFourMissionCount++;
  }

  if (soundFourMissionCount === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kidomaru (059): No missions with a friendly Sound Four character.',
      'game.log.effect.noTarget', { card: 'KIDOMARU', id: 'KS-059-C' }) } };
  }

  
  if (state.activeMissions.length < 2) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kidomaru (059): Only 1 mission in play, cannot move.',
      'game.log.effect.noTarget', { card: 'KIDOMARU', id: 'KS-059-C' }) } };
  }

  
  let hasMovable = false;
  for (let i = 0; i < state.activeMissions.length; i++) {
    
    if (isMovementBlockedByKurenai(state, i, sourcePlayer)) continue;
    for (const char of state.activeMissions[i][friendlySide]) {
      if (char.instanceId === ctx.sourceCard.instanceId) continue;
      
      const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
      const charName = topCard.name_fr;
      const hasValidDest = state.activeMissions.some((m, di) => {
        if (di === i) return false;
        return !m[friendlySide].some((c) => {
          if (c.instanceId === char.instanceId) return false;
          if (c.isHidden) return false;
          const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
          return cTop.name_fr === charName;
        });
      });
      if (hasValidDest) { hasMovable = true; break; }
    }
    if (hasMovable) break;
  }

  if (!hasMovable) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kidomaru (059): No friendly characters could be moved.',
      'game.log.effect.noTarget', { card: 'KIDOMARU', id: 'KS-059-C' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIDOMARU059_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.kidomaru059ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-059-C', 'MAIN', handleKidomaru059Main);
}
