import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 108/130 - NARUTO UZUMAKI "Believe it!" (RA)
 * Also applies to 108/130 A (Rare Art variant - same effects, handled by registry normalization)
 * Chakra: 5, Power: 5
 * Group: Leaf Village, Keywords: Team 7, Jutsu
 *
 * MAIN: Hide an enemy character with Power 3 or less in this mission.
 * UPGRADE: MAIN effect: Powerup X where X is the Power of the enemy character that is being hidden.
 *
 * Source: official narutotcgmythos.com (Feb 2026)
 */

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function naruto108MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };
  const isUpgrade = ctx.isUpgrade;

  const enemySideKey: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Find an enemy character with Power <= 3 in this mission
  const thisMission = state.activeMissions[ctx.sourceMissionIndex];
  const target = thisMission[enemySideKey].find(
    (c) => !c.isHidden && getEffectivePower(c) <= 3,
  );

  if (!target) {
    state = {
      ...state,
      log: logAction(
        state.log, state.turn, state.phase, ctx.sourcePlayer,
        'EFFECT_NO_TARGET',
        `Naruto Uzumaki (108): No valid enemy with Power 3 or less in this mission.`,
        'game.log.effect.noTarget',
        { card: 'NARUTO UZUMAKI', id: '108/130' },
      ),
    };
    return { state };
  }

  const targetPower = getEffectivePower(target);

  // Hide the target
  const missions = [...state.activeMissions];
  const mission = { ...missions[ctx.sourceMissionIndex] };
  const enemyChars = [...mission[enemySideKey]];
  const idx = enemyChars.findIndex((c) => c.instanceId === target.instanceId);
  if (idx !== -1) {
    enemyChars[idx] = { ...enemyChars[idx], isHidden: true };
    mission[enemySideKey] = enemyChars;
    missions[ctx.sourceMissionIndex] = mission;
    state = {
      ...state,
      activeMissions: missions,
      log: logAction(
        state.log, state.turn, state.phase, ctx.sourcePlayer,
        'EFFECT_HIDE',
        `Naruto Uzumaki (108): Hid enemy ${target.card.name_fr} (Power ${targetPower}) in this mission.`,
        'game.log.effect.hide',
        { card: 'NARUTO UZUMAKI', id: '108/130', target: target.card.name_fr, mission: `mission ${ctx.sourceMissionIndex}` },
      ),
    };
  }

  // UPGRADE: POWERUP X on self where X = the Power of the hidden character
  if (isUpgrade && targetPower > 0) {
    const friendlySideKey: 'player1Characters' | 'player2Characters' =
      ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

    const upgradeMissions = [...state.activeMissions];
    const upgradeMission = { ...upgradeMissions[ctx.sourceMissionIndex] };
    const friendlyChars = [...upgradeMission[friendlySideKey]];
    const selfIdx = friendlyChars.findIndex((c) => c.instanceId === ctx.sourceCard.instanceId);
    if (selfIdx !== -1) {
      friendlyChars[selfIdx] = {
        ...friendlyChars[selfIdx],
        powerTokens: friendlyChars[selfIdx].powerTokens + targetPower,
      };
      upgradeMission[friendlySideKey] = friendlyChars;
      upgradeMissions[ctx.sourceMissionIndex] = upgradeMission;
      state = {
        ...state,
        activeMissions: upgradeMissions,
        log: logAction(
          state.log, state.turn, state.phase, ctx.sourcePlayer,
          'EFFECT_POWERUP',
          `Naruto Uzumaki (108): POWERUP ${targetPower} (Power of hidden ${target.card.name_fr}).`,
          'game.log.effect.powerup',
          { card: 'NARUTO UZUMAKI', id: '108/130', amount: targetPower, target: 'self' },
        ),
      };
    }
  }

  return { state };
}

export function registerNaruto108Handlers(): void {
  registerEffect('108/130', 'MAIN', naruto108MainHandler);
  // No AMBUSH effect for this card — the old "place top card as hidden" was incorrect
}
