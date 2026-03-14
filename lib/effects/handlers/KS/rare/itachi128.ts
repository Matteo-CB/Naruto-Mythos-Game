import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { isMovementBlockedByKurenai } from '@/lib/effects/ContinuousEffects';

/**
 * Card 128/130 - ITACHI UCHIWA (R)
 * Chakra: 6, Power: 6
 * Group: Akatsuki, Keywords: Rogue Ninja
 *
 * MAIN [continuous]: Every enemy character in this mission has -1 Power.
 *   Handled by the engine's PowerCalculation (ContinuousEffects.ts).
 *
 * UPGRADE: Move a friendly character in play to another mission.
 *   Player chooses both the character and the destination.
 *   Validates Kurenai block + name uniqueness.
 */

function itachi128MainHandler(ctx: EffectContext): EffectResult {
  // Continuous power modifier: every enemy in this mission has -1 Power.
  // Handled by the engine's PowerCalculation.
  return { state: ctx.state };
}

function itachi128UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find friendly characters (not self) that have at least one valid destination
  const hasMovableChar = state.activeMissions.length >= 2 && state.activeMissions.some((mission, mIdx) => {
    for (const char of mission[friendlySide]) {
      if (char.instanceId === sourceCard.instanceId) continue;
      // Check Kurenai block on source mission
      if (isMovementBlockedByKurenai(state, mIdx, sourcePlayer)) continue;
      // Check if there's at least one other mission where name doesn't conflict
      for (let destIdx = 0; destIdx < state.activeMissions.length; destIdx++) {
        if (destIdx === mIdx) continue;
        if (canMoveToDestination(state, char, destIdx, sourcePlayer)) {
          return true;
        }
      }
    }
    return false;
  });

  if (!hasMovableChar) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Itachi Uchiwa (128) UPGRADE: No friendly characters can be moved.',
          'game.log.effect.noTarget',
          { card: 'ITACHI UCHIWA', id: 'KS-128-R' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ITACHI128_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Itachi Uchiwa (128) UPGRADE: Move a friendly character in play to another mission?',
    descriptionKey: 'game.effect.desc.itachi128ConfirmUpgrade',
  };
}

/**
 * Check if a character can be moved to a given destination mission (name uniqueness).
 */
function canMoveToDestination(
  state: GameState,
  char: CharacterInPlay,
  destMissionIndex: number,
  controllingPlayer: PlayerID,
): boolean {
  if (char.isHidden) return true;

  const destMission = state.activeMissions[destMissionIndex];
  if (!destMission) return false;

  const charName = char.card.name_fr.toUpperCase();
  const friendlyChars = controllingPlayer === 'player1'
    ? destMission.player1Characters
    : destMission.player2Characters;

  for (const existing of friendlyChars) {
    if (!existing.isHidden && existing.card.name_fr.toUpperCase() === charName) {
      return false;
    }
  }
  return true;
}

export function registerItachi128Handlers(): void {
  registerEffect('KS-128-R', 'MAIN', itachi128MainHandler);
  registerEffect('KS-128-R', 'UPGRADE', itachi128UpgradeHandler);
}
