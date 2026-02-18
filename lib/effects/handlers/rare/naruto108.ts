import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay, PlayerID } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 108/130 - NARUTO UZUMAKI (R)
 * Also applies to 108/130 A (Rare Art variant - same effects, handled by registry normalization)
 * Chakra: 5, Power: 5
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN: Hide an enemy character with Power 3 or less in this mission.
 * MAIN "effect:": Powerup X where X is the Power of the enemy character that is being hidden.
 *   - The "effect:" modifier applies when this card is played as an upgrade.
 *   - When upgrading: hide the enemy AND gain power tokens equal to the target's power.
 */

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function naruto108MainHandler(ctx: EffectContext): EffectResult {
  const state = { ...ctx.state };
  const missions = [...state.activeMissions];
  const mission = { ...missions[ctx.sourceMissionIndex] };

  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const enemyChars = [...mission[enemySide]];

  // Find first valid target: enemy character with effective power <= 3 that is not already hidden
  const targetIndex = enemyChars.findIndex((c) => !c.isHidden && getEffectivePower(c) <= 3);

  if (targetIndex === -1) {
    // No valid target
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Naruto Uzumaki (108): No valid enemy character with Power 3 or less to hide.',
    );
    return { state: { ...state, log } };
  }

  const target = enemyChars[targetIndex];
  const targetPower = getEffectivePower(target);

  // Hide the target
  enemyChars[targetIndex] = { ...target, isHidden: true };
  mission[enemySide] = enemyChars;
  missions[ctx.sourceMissionIndex] = mission;

  let log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_HIDE',
    `Naruto Uzumaki (108): Hid enemy ${target.card.name_fr} (Power ${targetPower}) in this mission.`,
  );

  let newState = { ...state, activeMissions: missions, log };

  // If this is an upgrade, also apply the "effect:" modifier: POWERUP X where X = target's power
  if (ctx.isUpgrade && targetPower > 0) {
    const updatedMissions = [...newState.activeMissions];
    const updatedMission = { ...updatedMissions[ctx.sourceMissionIndex] };
    const friendlySide: 'player1Characters' | 'player2Characters' =
      ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
    const friendlyChars = [...updatedMission[friendlySide]];
    const selfIndex = friendlyChars.findIndex((c) => c.instanceId === ctx.sourceCard.instanceId);

    if (selfIndex !== -1) {
      friendlyChars[selfIndex] = {
        ...friendlyChars[selfIndex],
        powerTokens: friendlyChars[selfIndex].powerTokens + targetPower,
      };
      updatedMission[friendlySide] = friendlyChars;
      updatedMissions[ctx.sourceMissionIndex] = updatedMission;

      log = logAction(
        newState.log,
        newState.turn,
        newState.phase,
        ctx.sourcePlayer,
        'EFFECT_POWERUP',
        `Naruto Uzumaki (108): POWERUP ${targetPower} (upgrade modifier, X = hidden enemy's Power).`,
      );
      newState = { ...newState, activeMissions: updatedMissions, log };
    }
  }

  return { state: newState };
}

export function registerNaruto108Handlers(): void {
  registerEffect('108/130', 'MAIN', naruto108MainHandler);
}
