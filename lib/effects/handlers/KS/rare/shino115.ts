import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { isMovementBlockedByKurenai } from '@/lib/effects/ContinuousEffects';
import type { CharacterInPlay } from '@/lib/engine/types';

/**
 * Card 115/130 - SHINO ABURAME (R/RA)
 * Chakra: 5 | Power: 6
 * Group: Leaf Village | Keywords: Team 8, Jutsu
 *
 * MAIN [continuous]: Friendly characters in this mission cannot be hidden by enemy effects.
 *   -> Implemented in ContinuousEffects.ts via checkCanHideCharacter().
 *
 * AMBUSH: Move one friendly character in this mission.
 *   -> Move a friendly character FROM another mission TO Shino's mission.
 */

function shino115AmbushHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find friendly characters in OTHER missions (not Shino's mission) that can move here
  const validTargets: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue;
    if (isMovementBlockedByKurenai(state, i, sourcePlayer)) continue;
    for (const char of state.activeMissions[i][friendlySide]) {
      // Check name uniqueness: would this character conflict on Shino's mission?
      if (!char.isHidden) {
        const topCard = char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        const charName = topCard.name_fr.toUpperCase();
        const destChars = state.activeMissions[sourceMissionIndex][friendlySide];
        const hasConflict = destChars.some((c: CharacterInPlay) =>
          c.instanceId !== char.instanceId && !c.isHidden &&
          (c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card).name_fr.toUpperCase() === charName
        );
        if (hasConflict) continue;
      }
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Shino Aburame (115) AMBUSH: No friendly character in another mission to move here.',
          'game.log.effect.noTarget',
          { card: 'SHINO ABURAME', id: 'KS-115-R' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SHINO115_CONFIRM_AMBUSH',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Shino Aburame (115) AMBUSH: Move a friendly character from another mission to this one.',
    descriptionKey: 'game.effect.desc.shino115ConfirmAmbush',
  };
}

export function registerShino115Handlers(): void {
  registerEffect('KS-115-R', 'AMBUSH', shino115AmbushHandler);
  registerEffect('KS-115-RA', 'AMBUSH', shino115AmbushHandler);
  // MAIN [continuous] is handled in ContinuousEffects.ts
}
