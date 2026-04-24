import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function handleNeji037Main(ctx: EffectContext): EffectResult {
  
  
  const log = logAction(
    ctx.state.log,
    ctx.state.turn,
    ctx.state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Neji Hyuga (037): Gains POWERUP 1 when a non-hidden enemy is played in this mission (continuous).',
    'game.log.effect.continuous',
    { card: 'NEJI HYUGA', id: 'KS-037-UC' },
  );
  return { state: { ...ctx.state, log } };
}

function handleNeji037Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide: 'player1Characters' | 'player2Characters' =
    opponentPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemyChars = mission[enemySide];

  
  const validTargets: string[] = [];
  for (const char of enemyChars) {
    if (char.isHidden) continue;
    if (char.powerTokens > 0) {
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Neji Hyuga (037): No enemy character with Power tokens in this mission.',
      'game.log.effect.noTarget', { card: 'NEJI HYUGA', id: 'KS-037-UC' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'NEJI037_CONFIRM_UPGRADE',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.neji037ConfirmUpgrade',
  };
}

function removeAllPowerTokens(
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
        tokensRemoved = char.powerTokens;
        return { ...char, powerTokens: 0 };
      }
      return char;
    }),
    player2Characters: mission.player2Characters.map((char) => {
      if (char.instanceId === targetInstanceId) {
        targetName = char.card.name_fr;
        tokensRemoved = char.powerTokens;
        return { ...char, powerTokens: 0 };
      }
      return char;
    }),
  }));

  newState.log = logAction(
    newState.log,
    newState.turn,
    newState.phase,
    sourcePlayer,
    'EFFECT_REMOVE_TOKENS',
    `Neji Hyuga (037): Removed all Power tokens (${tokensRemoved}) from ${targetName} (upgrade).`,
    'game.log.effect.removeTokens',
    { card: 'NEJI HYUGA', id: 'KS-037-UC', amount: tokensRemoved, target: targetName },
  );

  return newState;
}

export function registerNeji037Handlers(): void {
  registerEffect('KS-037-UC', 'MAIN', handleNeji037Main);
  registerEffect('KS-037-UC', 'UPGRADE', handleNeji037Upgrade);
}
