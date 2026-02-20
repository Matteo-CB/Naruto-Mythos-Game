import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 020/130 - INO YAMANAKA "Transposition" (UC)
 * Chakra: 3 | Power: 0
 * Group: Leaf Village | Keywords: Team 10, Jutsu
 *
 * MAIN: Take control of an enemy character with cost 2 or less in this mission.
 *   - Targets non-hidden enemy characters in this mission with printed chakra cost <= 2.
 *   - If exactly 1 valid target, auto-apply: change controlledBy to source player.
 *   - If multiple targets, return requiresTargetSelection.
 *   - Hidden characters have cost 0 when targeted by enemy effects, so they are valid
 *     targets if their effective cost (0) is <= 2, but since the effect says "take control"
 *     and hidden characters have cost 0, they qualify. However, the effect text implies
 *     visible characters (you need to know the cost). We target non-hidden characters only.
 *
 * UPGRADE: MAIN effect: Instead, the cost limit is 3 or less.
 *   - When triggered as upgrade, the cost threshold changes from 2 to 3.
 */

function handleIno020Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex, isUpgrade } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide = opponentPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemyChars = mission[enemySide];

  const costLimit = isUpgrade ? 3 : 2;

  // Find non-hidden enemy characters with cost <= costLimit
  const validTargets: string[] = [];
  for (const char of enemyChars) {
    if (char.isHidden) continue;
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    if (topCard.chakra <= costLimit) {
      validTargets.push(char.instanceId);
    }
  }

  // If no valid targets, effect fizzles
  if (validTargets.length === 0) {
    const limitStr = isUpgrade ? '3' : '2';
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      `Ino Yamanaka (020): No enemy character with cost ${limitStr} or less in this mission.`,
      'game.log.effect.noTarget', { card: 'INO YAMANAKA', id: '020/130' }) } };
  }

  // If exactly one target, auto-apply
  if (validTargets.length === 1) {
    const targetId = validTargets[0];
    const newState = takeControlOfCharacter(state, targetId, sourceMissionIndex, sourcePlayer, opponentPlayer, costLimit);
    return { state: newState };
  }

  // Multiple targets: requires selection
  const limitStr = isUpgrade ? '3' : '2';
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TAKE_CONTROL_ENEMY_THIS_MISSION',
    validTargets,
    description: `Select an enemy character with cost ${limitStr} or less in this mission to take control of.`,
  };
}

function takeControlOfCharacter(
  state: import('../../EffectTypes').EffectContext['state'],
  targetInstanceId: string,
  missionIndex: number,
  sourcePlayer: import('../../../engine/types').PlayerID,
  opponentPlayer: import('../../../engine/types').PlayerID,
  costLimit: number,
): import('../../EffectTypes').EffectContext['state'] {
  const newState = { ...state };
  const missions = [...state.activeMissions];
  const mission = { ...missions[missionIndex] };

  const enemySide = opponentPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const enemyChars = [...mission[enemySide]];
  const friendlyChars = [...mission[friendlySide]];

  // Find and remove the target from enemy side
  const targetIdx = enemyChars.findIndex((c) => c.instanceId === targetInstanceId);
  if (targetIdx === -1) return state;

  const targetChar = { ...enemyChars[targetIdx], controlledBy: sourcePlayer };
  const targetName = targetChar.card.name_fr;

  enemyChars.splice(targetIdx, 1);
  friendlyChars.push(targetChar);

  mission[enemySide] = enemyChars;
  mission[friendlySide] = friendlyChars;
  missions[missionIndex] = mission;

  // Update character counts for both players
  const newSourcePlayer = { ...newState[sourcePlayer] };
  const newOpponentPlayer = { ...newState[opponentPlayer] };

  let sourceCharCount = 0;
  let opponentCharCount = 0;
  for (const m of missions) {
    sourceCharCount += (sourcePlayer === 'player1' ? m.player1Characters : m.player2Characters).length;
    opponentCharCount += (opponentPlayer === 'player1' ? m.player1Characters : m.player2Characters).length;
  }
  newSourcePlayer.charactersInPlay = sourceCharCount;
  newOpponentPlayer.charactersInPlay = opponentCharCount;

  newState[sourcePlayer] = newSourcePlayer;
  newState[opponentPlayer] = newOpponentPlayer;
  newState.activeMissions = missions;

  newState.log = logAction(
    state.log, state.turn, state.phase, sourcePlayer,
    'EFFECT_TAKE_CONTROL',
    `Ino Yamanaka (020): Takes control of ${targetName} (cost <= ${costLimit}) in this mission.`,
    'game.log.effect.takeControl',
    { card: 'INO YAMANAKA', id: '020/130', target: targetName, costLimit: String(costLimit) },
  );

  return newState;
}

export function registerHandler(): void {
  registerEffect('020/130', 'MAIN', handleIno020Main);
  // UPGRADE triggers the same MAIN handler with ctx.isUpgrade = true
  // The MAIN handler checks isUpgrade to adjust the cost threshold from 2 to 3
}
