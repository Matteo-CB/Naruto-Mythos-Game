import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatEnemyCharacter } from '../../defeatUtils';
import type { CharacterInPlay } from '../../../engine/types';

/**
 * Card 124/130 - KIDOMARU (R)
 * Chakra: 4, Power: 3
 * Group: Sound Village, Keywords: Sound Four
 *
 * AMBUSH: Defeat an enemy with Power 3 or less in another mission (not this one).
 *   Find non-hidden enemies in OTHER missions with effective power <= 3. Target selection. Defeat.
 *
 * UPGRADE: AMBUSH: Power limit becomes 5 or less.
 *   When isUpgrade: use power <= 5 instead of 3.
 */

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function kidomaru124AmbushHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex, isUpgrade } = ctx;
  const powerLimit = isUpgrade ? 5 : 3;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Find non-hidden enemies in OTHER missions with effective power <= powerLimit
  const validTargets: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue; // Skip this mission
    const mission = state.activeMissions[i];
    for (const char of mission[enemySide]) {
      if (!char.isHidden && getEffectivePower(char) <= powerLimit) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          `Kidomaru (124) AMBUSH: No enemy with Power ${powerLimit} or less in other missions.`,
          'game.log.effect.noTarget',
          { card: 'KIDOMARU', id: '124/130' },
        ),
      },
    };
  }

  // If exactly one target, auto-resolve
  if (validTargets.length === 1) {
    // Find the target's mission index for defeat
    for (let i = 0; i < state.activeMissions.length; i++) {
      if (i === sourceMissionIndex) continue;
      const mission = state.activeMissions[i];
      const targetChar = mission[enemySide].find((c: CharacterInPlay) => c.instanceId === validTargets[0]);
      if (targetChar) {
        const targetName = targetChar.card.name_fr;
        let newState = defeatEnemyCharacter(state, i, validTargets[0], sourcePlayer);
        newState = {
          ...newState,
          log: logAction(
            newState.log, newState.turn, newState.phase, sourcePlayer,
            'EFFECT_DEFEAT',
            `Kidomaru (124) AMBUSH: Defeated ${targetName} (Power ${getEffectivePower(targetChar)}) in mission ${i}.`,
            'game.log.effect.defeat',
            { card: 'KIDOMARU', id: '124/130', target: targetName },
          ),
        };
        return { state: newState };
      }
    }
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIDOMARU124_DEFEAT_TARGET',
    validTargets,
    description: isUpgrade
      ? 'Kidomaru (124) AMBUSH (UPGRADE): Choose an enemy with Power 5 or less in another mission to defeat.'
      : 'Kidomaru (124) AMBUSH: Choose an enemy with Power 3 or less in another mission to defeat.',
  };
}

function kidomaru124UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into AMBUSH handler via isUpgrade flag.
  return { state: ctx.state };
}

export function registerKidomaru124Handlers(): void {
  registerEffect('124/130', 'AMBUSH', kidomaru124AmbushHandler);
  registerEffect('124/130', 'UPGRADE', kidomaru124UpgradeHandler);
}
