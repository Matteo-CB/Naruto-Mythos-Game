import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';
import { getEffectivePower } from '../../powerUtils';

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

function naruto108MainHandler(ctx: EffectContext): EffectResult {
  const state = ctx.state;

  const opponentPlayer = ctx.sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySideKey: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Find all enemy characters with Power <= 3 in this mission
  const thisMission = state.activeMissions[ctx.sourceMissionIndex];
  const validTargets = thisMission[enemySideKey]
    .filter((c) => !c.isHidden && getEffectivePower(state, c, opponentPlayer) <= 3)
    .map((c) => c.instanceId);

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, ctx.sourcePlayer,
          'EFFECT_NO_TARGET',
          `Naruto Uzumaki (108): No valid enemy with Power 3 or less in this mission.`,
          'game.log.effect.noTarget',
          { card: 'NARUTO UZUMAKI', id: 'KS-108-R' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'NARUTO108_CHOOSE_HIDE_TARGET',
    validTargets,
    description: JSON.stringify({
      isUpgrade: ctx.isUpgrade,
      text: ctx.isUpgrade
        ? 'Naruto Uzumaki (108): Choose an enemy with Power 3 or less to hide (POWERUP bonus).'
        : 'Naruto Uzumaki (108): Choose an enemy with Power 3 or less to hide.',
    }),
    descriptionKey: ctx.isUpgrade
      ? 'game.effect.desc.naruto108ChooseHideUpgrade'
      : 'game.effect.desc.naruto108ChooseHide',
  };
}

export function registerNaruto108Handlers(): void {
  registerEffect('KS-108-R', 'MAIN', naruto108MainHandler);
  // No AMBUSH effect for this card — the old "place top card as hidden" was incorrect
}
