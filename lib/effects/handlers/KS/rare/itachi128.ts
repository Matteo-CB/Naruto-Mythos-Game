import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import type { CharacterInPlay } from '@/lib/engine/types';

/**
 * Card 128/130 - ITACHI UCHIWA (R)
 * Chakra: 6, Power: 6
 * Group: Akatsuki, Keywords: Rogue Ninja
 *
 * MAIN [continuous]: Every enemy character in this mission has -1 Power.
 *   Handled by the engine's PowerCalculation (ContinuousEffects.ts).
 *
 * UPGRADE: Move a friendly character in play to Itachi's mission.
 *   Pick a friendly character from another mission and move it here.
 *   Validates name uniqueness at Itachi's mission.
 */

function itachi128MainHandler(ctx: EffectContext): EffectResult {
  // Continuous power modifier: every enemy in this mission has -1 Power.
  // Handled by the engine's PowerCalculation.
  return { state: ctx.state };
}

function itachi128UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find friendly characters from OTHER missions (not Itachi's mission)
  // that can legally be moved to Itachi's mission (name uniqueness check)
  const validTargets: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue; // Skip Itachi's own mission
    const mission = state.activeMissions[i];
    for (const char of mission[friendlySide]) {
      // Check name uniqueness at Itachi's mission
      if (canMoveToMission(state, char, sourceMissionIndex, sourcePlayer)) {
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
          'Itachi Uchiwa (128) UPGRADE: No friendly characters can be moved to this mission.',
          'game.log.effect.noTarget',
          { card: 'ITACHI UCHIWA', id: 'KS-128-R' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ITACHI128_MOVE_TO_THIS_MISSION',
    validTargets,
    description: JSON.stringify({
      destMissionIndex: sourceMissionIndex,
      text: `Itachi Uchiwa (128) UPGRADE: Choose a friendly character to move to Itachi's mission.`,
    }),
    descriptionKey: 'game.effect.desc.itachi128MoveFriendly',
  };
}

/**
 * Check if a character can be moved to a given mission (name uniqueness).
 */
function canMoveToMission(
  state: import('@/lib/engine/types').GameState,
  char: CharacterInPlay,
  destMissionIndex: number,
  controllingPlayer: import('@/lib/engine/types').PlayerID,
): boolean {
  if (char.isHidden) return true; // Hidden chars don't violate name uniqueness

  const destMission = state.activeMissions[destMissionIndex];
  if (!destMission) return false;

  const charName = char.card.name_fr.toUpperCase();
  const friendlyChars = controllingPlayer === 'player1'
    ? destMission.player1Characters
    : destMission.player2Characters;

  for (const existing of friendlyChars) {
    if (!existing.isHidden && existing.card.name_fr.toUpperCase() === charName) {
      return false; // Name conflict
    }
  }
  return true;
}

export function registerItachi128Handlers(): void {
  registerEffect('KS-128-R', 'MAIN', itachi128MainHandler);
  registerEffect('KS-128-R', 'UPGRADE', itachi128UpgradeHandler);
}
