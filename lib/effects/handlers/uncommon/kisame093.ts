import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 093/130 - KISAME HOSHIGAKI "Samehada" (UC)
 * Chakra: 6 | Power: 6
 * Group: Akatsuki | Keywords: Rogue Ninja, Weapon
 *
 * MAIN: Remove up to 2 Power tokens from an enemy character in play and put them
 * on this character.
 *   - Targets enemy characters in ANY mission (not just this mission) that have
 *     power tokens > 0.
 *   - Removes up to 2 tokens from the target and adds them to Kisame (093).
 *
 * UPGRADE: MAIN effect: Instead, remove ALL Power tokens and put them on this character.
 *   - When triggered as upgrade, transfer ALL tokens instead of a max of 2.
 */

function handleKisame093Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex, isUpgrade } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  // Find enemy characters with power tokens across ALL missions
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    const enemyChars =
      opponentPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;
    for (const char of enemyChars) {
      if (char.powerTokens > 0) {
        validTargets.push(char.instanceId);
      }
    }
  }

  // If no valid targets, effect fizzles
  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kisame Hoshigaki (093): No enemy with Power tokens in play.',
      'game.log.effect.noTarget', { card: 'KISAME HOSHIGAKI', id: '093/130' }) } };
  }

  // If exactly one target, apply automatically
  if (validTargets.length === 1) {
    const targetId = validTargets[0];
    const maxTransfer = isUpgrade ? Infinity : 2;
    const newState = transferPowerTokens(state, targetId, sourceCard.instanceId, maxTransfer, sourceMissionIndex, sourcePlayer, isUpgrade);
    return { state: newState };
  }

  // Multiple targets: requires selection
  const desc = isUpgrade
    ? 'Select an enemy character in play to steal ALL Power tokens from (upgrade).'
    : 'Select an enemy character in play to steal up to 2 Power tokens from.';
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'STEAL_POWER_TOKENS_ENEMY_IN_PLAY',
    validTargets,
    description: desc,
  };
}

function transferPowerTokens(
  state: import('../../EffectTypes').EffectContext['state'],
  fromInstanceId: string,
  toInstanceId: string,
  maxTransfer: number,
  sourceMissionIndex: number,
  sourcePlayer: import('../../../engine/types').PlayerID,
  isUpgrade: boolean,
): import('../../EffectTypes').EffectContext['state'] {
  // First, find how many tokens the target actually has
  let tokensAvailable = 0;
  let targetName = '';
  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      if (char.instanceId === fromInstanceId) {
        tokensAvailable = char.powerTokens;
        targetName = char.card.name_fr;
        break;
      }
    }
    if (tokensAvailable > 0) break;
  }

  const tokensToTransfer = Math.min(maxTransfer, tokensAvailable);

  const newState = { ...state };
  newState.activeMissions = state.activeMissions.map((m) => ({
    ...m,
    player1Characters: m.player1Characters.map((char) => {
      if (char.instanceId === fromInstanceId) {
        return { ...char, powerTokens: char.powerTokens - tokensToTransfer };
      }
      if (char.instanceId === toInstanceId) {
        return { ...char, powerTokens: char.powerTokens + tokensToTransfer };
      }
      return char;
    }),
    player2Characters: m.player2Characters.map((char) => {
      if (char.instanceId === fromInstanceId) {
        return { ...char, powerTokens: char.powerTokens - tokensToTransfer };
      }
      if (char.instanceId === toInstanceId) {
        return { ...char, powerTokens: char.powerTokens + tokensToTransfer };
      }
      return char;
    }),
  }));

  const transferDesc = isUpgrade ? `all ${tokensToTransfer}` : `up to 2 (${tokensToTransfer})`;
  newState.log = logAction(
    newState.log, newState.turn, newState.phase, sourcePlayer,
    'EFFECT_STEAL_TOKENS',
    `Kisame Hoshigaki (093): Stole ${transferDesc} Power tokens from ${targetName}.`,
    'game.log.effect.stealTokens',
    { card: 'KISAME HOSHIGAKI', id: '093/130', amount: tokensToTransfer, target: targetName },
  );

  return newState;
}

export function registerHandler(): void {
  registerEffect('093/130', 'MAIN', handleKisame093Main);
  // UPGRADE triggers the same MAIN handler with ctx.isUpgrade = true
  // The MAIN handler checks isUpgrade to transfer ALL tokens instead of max 2
}
