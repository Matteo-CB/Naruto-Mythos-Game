import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { isCharacterCopyable } from '@/lib/effects/handlers/KS/shared/copyExclusions';



function kakashi148MainHandler(ctx: EffectContext): EffectResult {
  const state = ctx.state;

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KAKASHI148_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ sourceMissionIndex: ctx.sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.kakashi148ConfirmMain',
  };
}

function kakashi148AmbushHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  
  const validTargets: string[] = [];

  for (let i = 0; i < state.activeMissions.length; i++) {
    for (const char of state.activeMissions[i][friendlySide]) {
      if (char.instanceId === ctx.sourceCard.instanceId) continue;
      if (char.isHidden) continue;

      
      const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
      if (!topCard.keywords || !topCard.keywords.includes('Team 7')) continue;
      if (!isCharacterCopyable(topCard)) continue;

      
      
      const hasCopyableEffect = topCard.effects.some((effect) => {
        if (effect.type === 'SCORE') return false; // SCORE never copyable
        
        
        if (effect.description.includes('[⧗]')) return false;
        
        if (/(?:^|\s)(?:MAIN|AMBUSH|UPGRADE|SCORE)\s+effect\b/.test(effect.description)) return false;
        return true;
      });

      if (hasCopyableEffect) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kakashi Hatake (148): No friendly Team 7 character with a copyable instant effect found (ambush).',
      'game.log.effect.noTarget',
      { card: 'KAKASHI HATAKE', id: 'KS-148-M' },
    );
    return { state: { ...state, log } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KAKASHI148_CONFIRM_AMBUSH',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ team7Count: validTargets.length }),
    descriptionKey: 'game.effect.desc.kakashi148ConfirmAmbush',
  };
}

export function registerKakashi148Handlers(): void {
  registerEffect('KS-148-M', 'MAIN', kakashi148MainHandler);
  registerEffect('KS-148-M', 'AMBUSH', kakashi148AmbushHandler);
}
