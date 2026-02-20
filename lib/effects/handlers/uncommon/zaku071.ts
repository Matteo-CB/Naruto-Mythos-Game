import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 071/130 - ZAKU ABUMI "Air Slice" (UC)
 * Chakra: 4 | Power: 5
 * Group: Sound Village | Keywords: Team Dosu
 *
 * MAIN: If you have fewer non-hidden characters than the enemy in this mission,
 *   move an enemy character from this mission to another mission.
 *   - Count non-hidden friendly vs non-hidden enemy characters in this mission.
 *   - If the player has strictly fewer, they select an enemy character to move
 *     and a destination mission (target selection).
 *   - If not fewer, effect fizzles.
 *
 * UPGRADE: POWERUP 2 (self).
 *   - When played as an upgrade, add 2 power tokens to this character.
 */

function getEffectivePower(char: import('../../../engine/types').CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function handleZaku071Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemySide = sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Count non-hidden characters for each side in this mission
  const friendlyNonHiddenCount = mission[friendlySide].filter((c) => !c.isHidden).length;
  const enemyNonHiddenCount = mission[enemySide].filter((c) => !c.isHidden).length;

  if (friendlyNonHiddenCount >= enemyNonHiddenCount) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      `Zaku Abumi (071): You do not have fewer non-hidden characters than the enemy in this mission (${friendlyNonHiddenCount} vs ${enemyNonHiddenCount}).`,
      'game.log.effect.noTarget',
      { card: 'ZAKU ABUMI', id: '071/130' },
    );
    return { state: { ...state, log } };
  }

  // Find enemy characters in this mission that can be moved
  const validTargets: string[] = [];
  for (const char of mission[enemySide]) {
    validTargets.push(char.instanceId);
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      'Zaku Abumi (071): No enemy characters to move in this mission.',
      'game.log.effect.noTarget',
      { card: 'ZAKU ABUMI', id: '071/130' },
    );
    return { state: { ...state, log } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MOVE_ENEMY_FROM_THIS_MISSION',
    validTargets,
    description: `Zaku Abumi (071): You have fewer non-hidden characters (${friendlyNonHiddenCount} vs ${enemyNonHiddenCount}). Select an enemy character in this mission to move to another mission.`,
  };
}

function handleZaku071Upgrade(ctx: EffectContext): EffectResult {
  // UPGRADE: POWERUP 2 on self
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const newState = { ...state };
  const missions = [...newState.activeMissions];
  const mission = { ...missions[sourceMissionIndex] };
  const side = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const chars = [...mission[side]];
  const charIndex = chars.findIndex((c) => c.instanceId === sourceCard.instanceId);

  if (charIndex !== -1) {
    chars[charIndex] = {
      ...chars[charIndex],
      powerTokens: chars[charIndex].powerTokens + 2,
    };
    mission[side] = chars;
    missions[sourceMissionIndex] = mission;

    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_POWERUP',
      'Zaku Abumi (071): POWERUP 2 (upgrade effect). Power tokens added: 2.',
      'game.log.effect.powerupSelf',
      { card: 'ZAKU ABUMI', id: '071/130', amount: 2 },
    );

    return { state: { ...newState, activeMissions: missions, log } };
  }

  return { state: newState };
}

export function registerZaku071Handlers(): void {
  registerEffect('071/130', 'MAIN', handleZaku071Main);
  registerEffect('071/130', 'UPGRADE', handleZaku071Upgrade);
}
