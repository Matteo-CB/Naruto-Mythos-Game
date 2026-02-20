import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatCharacterInPlay } from '../../defeatUtils';

/**
 * Card 041/130 - TENTEN (UC)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Team Guy, Weapon
 *
 * MAIN: Defeat a hidden character in this mission.
 *   - Find ALL hidden characters (both friendly and enemy) in this mission, excluding self.
 *   - If exactly one valid target, auto-apply.
 *   - If multiple targets, require target selection.
 *   - Defeat the target (using defeatCharacterInPlay to respect replacements).
 *
 * UPGRADE: POWERUP 1 another friendly Leaf Village character in play (any mission).
 *   - Find all friendly non-hidden Leaf Village characters across all missions, excluding self.
 *   - If exactly one valid target, auto-apply POWERUP 1.
 *   - If multiple targets, require target selection.
 */

function handleTenten041Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];

  // Find all hidden characters in this mission (both sides), excluding self
  const validTargets: string[] = [];

  for (const char of mission.player1Characters) {
    if (char.isHidden && char.instanceId !== sourceCard.instanceId) {
      validTargets.push(char.instanceId);
    }
  }
  for (const char of mission.player2Characters) {
    if (char.isHidden && char.instanceId !== sourceCard.instanceId) {
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Tenten (041): No hidden character in this mission to defeat.',
      'game.log.effect.noTarget', { card: 'TENTEN', id: '041/130' }) } };
  }

  // Auto-apply if exactly one target
  if (validTargets.length === 1) {
    const targetId = validTargets[0];
    // Determine which side the target is on
    const isP1 = mission.player1Characters.some((c) => c.instanceId === targetId);
    const side: 'player1Characters' | 'player2Characters' = isP1 ? 'player1Characters' : 'player2Characters';
    const isEnemy = (side === 'player1Characters' && sourcePlayer === 'player2') ||
                    (side === 'player2Characters' && sourcePlayer === 'player1');

    let newState = defeatCharacterInPlay(state, sourceMissionIndex, targetId, side, isEnemy, sourcePlayer);
    newState = { ...newState, log: logAction(newState.log, state.turn, state.phase, sourcePlayer, 'EFFECT_DEFEAT',
      'Tenten (041): Defeated a hidden character in this mission.',
      'game.log.effect.defeat', { card: 'TENTEN', id: '041/130', target: '' }) };
    return { state: newState };
  }

  // Multiple targets: require target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TENTEN_DEFEAT_HIDDEN',
    validTargets,
    description: 'Select a hidden character in this mission to defeat.',
  };
}

function handleTenten041Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find all friendly non-hidden Leaf Village characters across all missions, excluding self
  const validTargets: string[] = [];

  for (const mission of state.activeMissions) {
    for (const char of mission[friendlySide]) {
      if (char.instanceId === sourceCard.instanceId) continue;
      if (char.isHidden) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.group === 'Leaf Village') {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Tenten (041): No other friendly Leaf Village character in play to power up.',
      'game.log.effect.noTarget', { card: 'TENTEN', id: '041/130' }) } };
  }

  // Auto-apply if exactly one target
  if (validTargets.length === 1) {
    const newState = powerUpTarget(state, validTargets[0], 1, sourcePlayer);
    return { state: newState };
  }

  // Multiple targets: require target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TENTEN_POWERUP_LEAF',
    validTargets,
    description: 'Select a friendly Leaf Village character in play to give POWERUP 1.',
  };
}

function powerUpTarget(
  state: import('../../EffectTypes').EffectContext['state'],
  targetInstanceId: string,
  amount: number,
  sourcePlayer: import('../../../engine/types').PlayerID,
): import('../../EffectTypes').EffectContext['state'] {
  let targetName = '';

  const newState = { ...state };
  newState.activeMissions = state.activeMissions.map((mission) => ({
    ...mission,
    player1Characters: mission.player1Characters.map((char) => {
      if (char.instanceId === targetInstanceId) {
        targetName = char.card.name_fr;
        return { ...char, powerTokens: char.powerTokens + amount };
      }
      return char;
    }),
    player2Characters: mission.player2Characters.map((char) => {
      if (char.instanceId === targetInstanceId) {
        targetName = char.card.name_fr;
        return { ...char, powerTokens: char.powerTokens + amount };
      }
      return char;
    }),
  }));

  newState.log = logAction(
    newState.log,
    newState.turn,
    newState.phase,
    sourcePlayer,
    'EFFECT_POWERUP',
    `Tenten (041): POWERUP ${amount} on ${targetName} (upgrade).`,
    'game.log.effect.powerup',
    { card: 'TENTEN', id: '041/130', amount: String(amount), target: targetName },
  );

  return newState;
}

export function registerTenten041Handlers(): void {
  registerEffect('041/130', 'MAIN', handleTenten041Main);
  registerEffect('041/130', 'UPGRADE', handleTenten041Upgrade);
}
