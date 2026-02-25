import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import { getEffectivePower } from '../../powerUtils';

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

function kidomaru124AmbushHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex, sourceCard } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' as const : 'player1' as const;
  // Check if character was upgraded by looking at stack length (not isUpgrade flag,
  // since AMBUSH fires on reveal which always passes isUpgrade=false)
  const wasUpgraded = sourceCard && sourceCard.stack.length >= 2;
  const powerLimit = wasUpgraded ? 5 : 3;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Find enemies in OTHER missions with effective power <= powerLimit (hidden = power 0, valid)
  const validTargets: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue; // Skip this mission
    const mission = state.activeMissions[i];
    for (const char of mission[enemySide]) {
      if (getEffectivePower(state, char, opponentPlayer) <= powerLimit) {
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
          { card: 'KIDOMARU', id: 'KS-124-R' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIDOMARU124_DEFEAT_TARGET',
    validTargets,
    description: wasUpgraded
      ? 'Kidomaru (124) AMBUSH (UPGRADE): Choose an enemy with Power 5 or less in another mission to defeat.'
      : 'Kidomaru (124) AMBUSH: Choose an enemy with Power 3 or less in another mission to defeat.',
    descriptionKey: wasUpgraded
      ? 'game.effect.desc.kidomaru124DefeatUpgrade'
      : 'game.effect.desc.kidomaru124Defeat',
  };
}

function kidomaru124UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into AMBUSH handler via isUpgrade flag.
  return { state: ctx.state };
}

export function registerKidomaru124Handlers(): void {
  registerEffect('KS-124-R', 'AMBUSH', kidomaru124AmbushHandler);
  registerEffect('KS-124-R', 'UPGRADE', kidomaru124UpgradeHandler);
}
