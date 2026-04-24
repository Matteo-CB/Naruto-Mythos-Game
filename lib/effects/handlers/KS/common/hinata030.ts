import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';


function handleHinata030Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  
  
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
      if (char.powerTokens > 0) {
        validTargets.push(char.instanceId);
      }
    }
  }

  
  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Hinata Hyuga (030): No enemy character with Power tokens in play.',
      'game.log.effect.noTarget', { card: 'HINATA HYUGA', id: 'KS-030-C' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'HINATA030_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.hinata030ConfirmMain',
  };
}

function removePowerTokens(
  state: import('@/lib/effects/EffectTypes').EffectContext['state'],
  targetInstanceId: string,
  sourcePlayer: import('@/lib/engine/types').PlayerID,
): import('@/lib/effects/EffectTypes').EffectContext['state'] {
  let targetName = '';
  let tokensRemoved = 0;

  const newState = { ...state };
  newState.activeMissions = state.activeMissions.map((mission) => ({
    ...mission,
    player1Characters: mission.player1Characters.map((char) => {
      if (char.instanceId === targetInstanceId) {
        targetName = char.card.name_fr;
        tokensRemoved = Math.min(2, char.powerTokens);
        return { ...char, powerTokens: char.powerTokens - tokensRemoved };
      }
      return char;
    }),
    player2Characters: mission.player2Characters.map((char) => {
      if (char.instanceId === targetInstanceId) {
        targetName = char.card.name_fr;
        tokensRemoved = Math.min(2, char.powerTokens);
        return { ...char, powerTokens: char.powerTokens - tokensRemoved };
      }
      return char;
    }),
  }));

  newState.log = logAction(
    newState.log, newState.turn, newState.phase, sourcePlayer,
    'EFFECT_REMOVE_TOKENS',
    `Hinata Hyuga (030): Removed ${tokensRemoved} Power token(s) from ${targetName}.`,
    'game.log.effect.removeTokens',
    { card: 'HINATA HYUGA', id: 'KS-030-C', amount: tokensRemoved, target: targetName },
  );

  return newState;
}

export function registerHandler(): void {
  registerEffect('KS-030-C', 'MAIN', handleHinata030Main);
}
