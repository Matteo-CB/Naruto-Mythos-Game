import type { EffectContext, EffectResult } from '../../EffectTypes';
import type { CharacterInPlay } from '../../../engine/types';
import { registerEffect } from '../../EffectRegistry';
import { defeatEnemyCharacter } from '../../defeatUtils';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 082/130 - BAKI "Wind Blade" (UC)
 * Chakra: 5 | Power: 3
 * Group: Sand Village | Keywords: Team Baki
 *
 * SCORE [arrow]: Defeat a hidden character in play (any player, any mission).
 *   - When the player wins the mission where Baki is assigned, they may defeat
 *     any single hidden character in play.
 *   - If multiple hidden characters exist, requires target selection.
 *   - If exactly one hidden character, auto-apply.
 *
 * UPGRADE: Defeat an enemy with Power 1 or less in this mission.
 *   - When played as upgrade, immediately defeat a non-hidden enemy character
 *     in this mission with effective power <= 1.
 *   - If multiple valid targets, requires target selection.
 */

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function handleBaki082Score(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  // Find all hidden characters in play across all missions (any player)
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      if (char.isHidden) {
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
      'SCORE_NO_TARGET',
      'Baki (082): [SCORE] No hidden characters in play to defeat.',
      'game.log.effect.noTarget',
      { card: 'BAKI', id: '082/130' },
    );
    return { state: { ...state, log } };
  }

  // If exactly one hidden target, auto-apply
  if (validTargets.length === 1) {
    const targetId = validTargets[0];
    let newState = defeatHiddenCharacter(state, targetId, sourcePlayer);
    return { state: newState };
  }

  // Multiple targets: requires selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'DEFEAT_HIDDEN_CHARACTER_ANY',
    validTargets,
    description: 'Baki (082) SCORE: Select a hidden character in play to defeat.',
  };
}

function handleBaki082Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const enemySide = sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const enemyChars = mission[enemySide];

  // Find non-hidden enemies with effective power <= 1 in this mission
  const validTargets: string[] = [];
  for (const char of enemyChars) {
    if (char.isHidden) continue;
    if (getEffectivePower(char) <= 1) {
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      'Baki (082): No enemy with Power 1 or less in this mission (upgrade).',
      'game.log.effect.noTarget',
      { card: 'BAKI', id: '082/130' },
    );
    return { state: { ...state, log } };
  }

  // If exactly one target, auto-defeat
  if (validTargets.length === 1) {
    const newState = defeatEnemyCharacter(state, sourceMissionIndex, validTargets[0], sourcePlayer);
    const log = logAction(
      newState.log,
      newState.turn,
      newState.phase,
      sourcePlayer,
      'EFFECT_DEFEAT',
      'Baki (082): Defeated enemy with Power 1 or less in this mission (upgrade).',
      'game.log.effect.defeat',
      { card: 'BAKI', id: '082/130' },
    );
    return { state: { ...newState, log } };
  }

  // Multiple targets: requires selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'DEFEAT_ENEMY_POWER_1_THIS_MISSION',
    validTargets,
    description: 'Baki (082) UPGRADE: Select an enemy character with Power 1 or less in this mission to defeat.',
  };
}

/**
 * Defeat a hidden character by instanceId. Can be from any player's side.
 * Determines the correct mission and side, then uses defeatEnemyCharacter or
 * defeatFriendlyCharacter as appropriate.
 */
function defeatHiddenCharacter(
  state: import('../../EffectTypes').EffectContext['state'],
  instanceId: string,
  sourcePlayer: import('../../../engine/types').PlayerID,
): import('../../EffectTypes').EffectContext['state'] {
  // Find the character across all missions
  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const charIdx = mission[side].findIndex((c) => c.instanceId === instanceId);
      if (charIdx !== -1) {
        const targetChar = mission[side][charIdx];
        const isEnemy = (side === 'player1Characters' && sourcePlayer === 'player2') ||
                        (side === 'player2Characters' && sourcePlayer === 'player1');
        const { defeatCharacterInPlay } = require('../../defeatUtils');
        let newState = defeatCharacterInPlay(state, i, instanceId, side, isEnemy, sourcePlayer);
        const log = logAction(
          newState.log,
          newState.turn,
          newState.phase,
          sourcePlayer,
          'SCORE_DEFEAT',
          `Baki (082): [SCORE] Defeated hidden character ${targetChar.card.name_fr}.`,
          'game.log.score.defeat',
          { card: 'BAKI', id: '082/130', target: targetChar.card.name_fr },
        );
        return { ...newState, log };
      }
    }
  }
  return state;
}

export function registerBaki082Handlers(): void {
  registerEffect('082/130', 'SCORE', handleBaki082Score);
  registerEffect('082/130', 'UPGRADE', handleBaki082Upgrade);
}
