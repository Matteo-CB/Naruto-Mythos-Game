import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import type { CharacterInPlay } from '../../../engine/types';

/**
 * Card 105/130 - JIRAYA (R)
 * Chakra: 6, Power: 5
 * Group: Leaf Village, Keywords: Sannin
 *
 * MAIN: Play a Summon character from hand anywhere, paying 3 less.
 *   Find Summon keyword characters in hand that the player can afford (cost - 3).
 *   Requires target selection for which Summon to play and which mission to place it on.
 *
 * UPGRADE: Move any enemy character from this mission to another mission.
 *   Requires target selection for which enemy to move and where.
 */

function jiraiya105MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, isUpgrade } = ctx;
  const playerState = state[sourcePlayer];

  // MAIN: Play a Summon character from hand, paying 3 less
  const affordableSummonIndices: string[] = [];
  for (let i = 0; i < playerState.hand.length; i++) {
    const card = playerState.hand[i];
    if (card.keywords && card.keywords.includes('Summon')) {
      const cost = Math.max(0, card.chakra - 3);
      if (playerState.chakra >= cost) {
        affordableSummonIndices.push(String(i));
      }
    }
  }

  if (affordableSummonIndices.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Jiraiya (105): No affordable Summon characters in hand (cost reduced by 3).',
          'game.log.effect.noTarget',
          { card: 'JIRAIYA', id: '105/130' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIRAIYA105_CHOOSE_SUMMON',
    validTargets: affordableSummonIndices,
    description: 'Jiraiya (105): Choose a Summon character from your hand to play (paying 3 less).',
  };
}

function jiraiya105UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const mission = state.activeMissions[sourceMissionIndex];
  const enemyChars = mission[enemySide];

  // Find enemy characters in this mission that can be moved
  const validTargets: string[] = enemyChars
    .filter((c: CharacterInPlay) => !c.isHidden)
    .map((c: CharacterInPlay) => c.instanceId);

  // Also include hidden enemies (they can be moved too)
  const allValidTargets: string[] = enemyChars.map((c: CharacterInPlay) => c.instanceId);

  if (allValidTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Jiraiya (105) UPGRADE: No enemy characters in this mission to move.',
          'game.log.effect.noTarget',
          { card: 'JIRAIYA', id: '105/130' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIRAIYA105_MOVE_ENEMY',
    validTargets: allValidTargets,
    description: 'Jiraiya (105) UPGRADE: Choose an enemy character in this mission to move to another mission.',
  };
}

export function registerJiraiya105Handlers(): void {
  registerEffect('105/130', 'MAIN', jiraiya105MainHandler);
  registerEffect('105/130', 'UPGRADE', jiraiya105UpgradeHandler);
}
