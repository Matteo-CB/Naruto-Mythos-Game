import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import type { CharacterInPlay } from '../../../engine/types';

/**
 * Card 110/130 - INO YAMANAKA (R)
 * Chakra: 5, Power: 4
 * Group: Leaf Village, Keywords: Team 10, Jutsu
 *
 * MAIN: If there are 2 or more enemy characters in this mission,
 *   move the weakest non-hidden enemy character from this mission.
 *
 * UPGRADE: MAIN effect: After moving, hide the enemy character.
 */

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function ino110MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex, isUpgrade } = ctx;
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
          { card: 'INO YAMANAKA', id: '110/130' },
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
          { card: 'INO YAMANAKA', id: '110/130' },
        ),
      },
    };
  }

  // Find the minimum effective power among non-hidden enemies
  let minPower = Infinity;
  for (const c of nonHiddenEnemies) {
    const ep = getEffectivePower(c);
    if (ep < minPower) minPower = ep;
  }

  // Filter to weakest enemies (may be multiple tied)
  const weakest = nonHiddenEnemies.filter((c) => getEffectivePower(c) === minPower);

  // If only one weakest and only one other mission, auto-resolve
  if (weakest.length === 1) {
    const otherMissions: string[] = [];
    for (let i = 0; i < state.activeMissions.length; i++) {
      if (i !== sourceMissionIndex) otherMissions.push(String(i));
    }
    if (otherMissions.length === 1) {
      // Auto-resolve: move to the only other mission
      return {
        state,
        requiresTargetSelection: false,
        autoMoveTarget: weakest[0].instanceId,
        autoMoveDestination: parseInt(otherMissions[0], 10),
        isUpgrade,
      } as EffectResult & { autoMoveTarget: string; autoMoveDestination: number };
    }
  }

  // Need target selection: which weakest enemy to move
  const validTargets = weakest.map((c) => c.instanceId);

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'INO110_CHOOSE_ENEMY',
    validTargets,
    description: isUpgrade
      ? 'Ino Yamanaka (110) MAIN+UPGRADE: Choose the weakest enemy character to move and hide.'
      : 'Ino Yamanaka (110) MAIN: Choose the weakest enemy character to move from this mission.',
  };
}

function ino110UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler via isUpgrade flag.
  return { state: ctx.state };
}

export function registerIno110Handlers(): void {
  registerEffect('110/130', 'MAIN', ino110MainHandler);
  registerEffect('110/130', 'UPGRADE', ino110UpgradeHandler);
}
