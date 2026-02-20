import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { defeatFriendlyCharacter } from '../../defeatUtils';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 085/130 - YASHAMARU "Sacrifice" (UC)
 * Chakra: 3 | Power: 2
 * Group: Sand Village
 *
 * SCORE [arrow]: Defeat this character. If you do, defeat another character in this mission.
 *   - When the player wins the mission where Yashamaru is assigned:
 *     1. First, defeat Yashamaru himself (self-destruction).
 *     2. If the self-defeat was successful, select another character in this mission
 *        (friendly or enemy) to defeat as well.
 *   - If no other characters remain in this mission after self-defeat, the second
 *     part fizzles.
 *   - Requires target selection if multiple characters remain.
 */

function handleYashamaru085Score(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;

  // Step 1: Defeat self
  let newState = defeatFriendlyCharacter(state, sourceMissionIndex, sourceCard.instanceId, sourcePlayer);

  // Check if self was actually removed (defeat might have been replaced)
  const mission = newState.activeMissions[sourceMissionIndex];
  const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const selfStillExists = mission[friendlySide].some((c) => c.instanceId === sourceCard.instanceId);

  if (selfStillExists) {
    // Self-defeat was replaced (e.g., by Hayate hide-instead). The "if you do" condition fails.
    const log = logAction(
      newState.log,
      newState.turn,
      newState.phase,
      sourcePlayer,
      'SCORE_DEFEAT_FAILED',
      'Yashamaru (085): [SCORE] Self-defeat was prevented. Cannot defeat another character.',
      'game.log.score.defeatFailed',
      { card: 'YASHAMARU', id: '085/130' },
    );
    return { state: { ...newState, log } };
  }

  const selfDefeatLog = logAction(
    newState.log,
    newState.turn,
    newState.phase,
    sourcePlayer,
    'SCORE_SELF_DEFEAT',
    'Yashamaru (085): [SCORE] Defeated self.',
    'game.log.score.selfDefeat',
    { card: 'YASHAMARU', id: '085/130' },
  );
  newState = { ...newState, log: selfDefeatLog };

  // Step 2: Find another character in this mission to defeat
  const updatedMission = newState.activeMissions[sourceMissionIndex];
  const allChars = [
    ...updatedMission.player1Characters,
    ...updatedMission.player2Characters,
  ];

  if (allChars.length === 0) {
    const log = logAction(
      newState.log,
      newState.turn,
      newState.phase,
      sourcePlayer,
      'SCORE_NO_TARGET',
      'Yashamaru (085): [SCORE] No other characters in this mission to defeat.',
      'game.log.effect.noTarget',
      { card: 'YASHAMARU', id: '085/130' },
    );
    return { state: { ...newState, log } };
  }

  // If exactly one target, auto-apply
  if (allChars.length === 1) {
    const targetChar = allChars[0];
    const targetSide = updatedMission.player1Characters.some((c) => c.instanceId === targetChar.instanceId)
      ? 'player1Characters' as const
      : 'player2Characters' as const;
    const isEnemy = (targetSide === 'player1Characters' && sourcePlayer === 'player2') ||
                    (targetSide === 'player2Characters' && sourcePlayer === 'player1');
    const { defeatCharacterInPlay } = require('../../defeatUtils');
    let finalState = defeatCharacterInPlay(newState, sourceMissionIndex, targetChar.instanceId, targetSide, isEnemy, sourcePlayer);
    const log = logAction(
      finalState.log,
      finalState.turn,
      finalState.phase,
      sourcePlayer,
      'SCORE_DEFEAT',
      `Yashamaru (085): [SCORE] Also defeated ${targetChar.card.name_fr} in this mission.`,
      'game.log.score.defeat',
      { card: 'YASHAMARU', id: '085/130', target: targetChar.card.name_fr },
    );
    return { state: { ...finalState, log } };
  }

  // Multiple targets: requires selection
  const validTargets = allChars.map((c) => c.instanceId);

  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'DEFEAT_ANY_CHARACTER_THIS_MISSION',
    validTargets,
    description: 'Yashamaru (085) SCORE: Self was defeated. Select another character in this mission to defeat.',
  };
}

export function registerHandler(): void {
  registerEffect('085/130', 'SCORE', handleYashamaru085Score);
}
