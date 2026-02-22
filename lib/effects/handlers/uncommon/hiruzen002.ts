import type { EffectContext, EffectResult } from '../../EffectTypes';
import type { CharacterInPlay } from '../../../engine/types';
import { registerEffect } from '../../EffectRegistry';
import { generateInstanceId } from '../../../engine/utils/id';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 002/130 - HIRUZEN SARUTOBI "Troisième Hokage" (UC)
 * Chakra: 5 | Power: 4
 * Group: Leaf Village | Keywords: Hokage
 *
 * MAIN: Play a Leaf Village character anywhere paying 1 less.
 *   - The player chooses which Leaf Village character from their hand to play
 *     and which mission to place it on (paying cost-1 chakra).
 *
 * UPGRADE: POWERUP 2 the character played with the MAIN effect.
 */

function handleHiruzen002Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, isUpgrade } = ctx;
  const playerState = state[sourcePlayer];

  // Find all affordable Leaf Village characters in hand
  const affordableLeafIndices: string[] = [];
  for (let i = 0; i < playerState.hand.length; i++) {
    const card = playerState.hand[i];
    if (card.group !== 'Leaf Village') continue;
    const reducedCost = Math.max(0, card.chakra - 1);
    if (playerState.chakra < reducedCost) continue;

    // Check if this card can be legally placed on at least one mission
    const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
    let canPlace = false;
    for (const mission of state.activeMissions) {
      const hasSameName = mission[friendlySide].some((c) => {
        if (c.isHidden) return false;
        const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase();
      });
      if (!hasSameName) {
        canPlace = true;
        break;
      }
    }
    if (canPlace) {
      affordableLeafIndices.push(String(i));
    }
  }

  if (affordableLeafIndices.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Hiruzen Sarutobi (002): No affordable Leaf Village character could be played on any mission.',
          'game.log.effect.noTarget',
          { card: 'HIRUZEN SARUTOBI', id: 'KS-002-UC' },
        ),
      },
    };
  }

  // If only one option, still let the player see it (mandatory "play" wording)
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'HIRUZEN002_CHOOSE_CARD',
    validTargets: affordableLeafIndices,
    description: isUpgrade
      ? 'Hiruzen Sarutobi (002): Choose a Leaf Village character from your hand to play (cost -1, + POWERUP 2).'
      : 'Hiruzen Sarutobi (002): Choose a Leaf Village character from your hand to play (cost -1).',
  };
}

export function registerHandler(): void {
  registerEffect('KS-002-UC', 'MAIN', handleHiruzen002Main);
  // UPGRADE triggers the same MAIN handler with ctx.isUpgrade = true
}
