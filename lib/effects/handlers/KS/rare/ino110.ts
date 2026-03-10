import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import type { CharacterInPlay } from '@/lib/engine/types';
import { getEffectivePower } from '@/lib/effects/powerUtils';

/**
 * Card 110/130 - INO YAMANAKA (R)
 * Chakra: 5, Power: 4
 * Group: Leaf Village, Keywords: Team 10, Jutsu
 *
 * MAIN: If there are 2 or more enemy characters in this mission,
 *   move the weakest non-hidden enemy character from this mission.
 *   The player chooses which mission to move the target to.
 *
 * UPGRADE: MAIN effect: After moving, hide the enemy character.
 */

function ino110MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex, isUpgrade } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const mission = state.activeMissions[sourceMissionIndex];
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  const enemies = mission[enemySide];

  // Check if there are 2+ enemy characters in this mission
  if (enemies.length < 2) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          `Ino Yamanaka (110) MAIN: Fewer than 2 enemy characters in this mission.`,
          'game.log.effect.noTarget',
          { card: 'INO YAMANAKA', id: 'KS-110-R' },
        ),
      },
    };
  }

  // Must have at least one other mission to move to
  if (state.activeMissions.length <= 1) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          `Ino Yamanaka (110) MAIN: Only one mission in play, cannot move characters.`,
          'game.log.effect.noTarget',
          { card: 'INO YAMANAKA', id: 'KS-110-R' },
        ),
      },
    };
  }

  // Find non-hidden enemies and their effective power
  const nonHiddenEnemies = enemies.filter((c) => !c.isHidden);
  if (nonHiddenEnemies.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          `Ino Yamanaka (110) MAIN: No non-hidden enemy characters in this mission.`,
          'game.log.effect.noTarget',
          { card: 'INO YAMANAKA', id: 'KS-110-R' },
        ),
      },
    };
  }

  // Find the minimum effective power among non-hidden enemies
  let minPower = Infinity;
  for (const c of nonHiddenEnemies) {
    const ep = getEffectivePower(state, c, opponentPlayer);
    if (ep < minPower) minPower = ep;
  }

  // Filter to weakest enemies (may be multiple tied)
  const weakest = nonHiddenEnemies.filter((c) => getEffectivePower(state, c, opponentPlayer) === minPower);

  // If exactly one weakest enemy, skip enemy selection step - go directly to destination choice.
  // The INO110_CHOOSE_ENEMY handler in EffectEngine will handle destination selection + upgrade hide.
  if (weakest.length === 1) {
    return {
      state,
      requiresTargetSelection: true,
      targetSelectionType: 'INO110_CHOOSE_ENEMY',
      validTargets: [weakest[0].instanceId],
      description: isUpgrade
        ? `Ino Yamanaka (110): Move ${weakest[0].card.name_fr} (Power ${getEffectivePower(state, weakest[0], opponentPlayer)}) to another mission, then hide them.`
        : `Ino Yamanaka (110): Move ${weakest[0].card.name_fr} (Power ${getEffectivePower(state, weakest[0], opponentPlayer)}) to another mission.`,
      descriptionKey: isUpgrade
        ? 'game.effect.desc.ino110MoveAndHide'
        : 'game.effect.desc.ino110Move',
      descriptionParams: { target: weakest[0].card.name_fr, power: getEffectivePower(state, weakest[0], opponentPlayer) },
    };
  }

  // Multiple tied for weakest - player must choose which one to move
  const validTargets = weakest.map((c) => c.instanceId);

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'INO110_CHOOSE_ENEMY',
    validTargets,
    description: isUpgrade
      ? 'Ino Yamanaka (110) MAIN+UPGRADE: Choose the weakest enemy character to move and hide.'
      : 'Ino Yamanaka (110) MAIN: Choose the weakest enemy character to move from this mission.',
    descriptionKey: isUpgrade
      ? 'game.effect.desc.ino110ChooseMoveHide'
      : 'game.effect.desc.ino110ChooseMove',
  };
}

function ino110UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler via isUpgrade flag.
  return { state: ctx.state };
}

export function registerIno110Handlers(): void {
  registerEffect('KS-110-R', 'MAIN', ino110MainHandler);
  registerEffect('KS-110-R', 'UPGRADE', ino110UpgradeHandler);
}
