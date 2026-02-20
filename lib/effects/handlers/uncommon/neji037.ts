import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 037/130 - NEJI HYUGA (UC)
 * Chakra: 4 | Power: 3
 * Group: Leaf Village | Keywords: Team Guy, Kekkei Genkai
 *
 * MAIN [continuous]: When a non-hidden enemy character is played in this mission, POWERUP 1 (self).
 *   - This is a continuous/passive effect. The actual logic of detecting when an
 *     enemy character is played face-visible in this mission and granting POWERUP 1
 *     is handled by ContinuousEffects.ts.
 *   - The MAIN handler here is a no-op that logs the continuous effect activation.
 *
 * UPGRADE: Remove all Power tokens from an enemy character in this mission.
 *   - Find non-hidden enemy characters in this mission that have powerTokens > 0.
 *   - If exactly one valid target, auto-apply.
 *   - If multiple targets, require target selection.
 *   - Set the target's powerTokens to 0.
 */

function handleNeji037Main(ctx: EffectContext): EffectResult {
  // Continuous effect [hourglass] - POWERUP 1 self when enemy plays non-hidden character here.
  // This is passively checked in ContinuousEffects.ts.
  const log = logAction(
    ctx.state.log,
    ctx.state.turn,
    ctx.state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Neji Hyuga (037): Gains POWERUP 1 when a non-hidden enemy is played in this mission (continuous).',
    'game.log.effect.continuous',
    { card: 'NEJI HYUGA', id: '037/130' },
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

  // Find non-hidden enemy characters with power tokens > 0
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
      'game.log.effect.noTarget', { card: 'NEJI HYUGA', id: '037/130' }) } };
  }

  // Auto-apply if exactly one target
  if (validTargets.length === 1) {
    const newState = removeAllPowerTokens(state, validTargets[0], sourcePlayer);
    return { state: newState };
  }

  // Multiple targets: require target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'NEJI037_REMOVE_ALL_TOKENS',
    validTargets,
    description: 'Select an enemy character in this mission to remove all Power tokens from.',
  };
}

function removeAllPowerTokens(
  state: import('../../EffectTypes').EffectContext['state'],
  targetInstanceId: string,
  sourcePlayer: import('../../../engine/types').PlayerID,
): import('../../EffectTypes').EffectContext['state'] {
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
    { card: 'NEJI HYUGA', id: '037/130', amount: tokensRemoved, target: targetName },
  );

  return newState;
}

export function registerNeji037Handlers(): void {
  registerEffect('037/130', 'MAIN', handleNeji037Main);
  registerEffect('037/130', 'UPGRADE', handleNeji037Upgrade);
}
