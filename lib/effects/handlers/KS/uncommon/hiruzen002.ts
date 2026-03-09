import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { generateInstanceId } from '@/lib/engine/utils/id';
import { logAction } from '@/lib/engine/utils/gameLog';
import { findHiddenLeafOnBoard } from '@/lib/effects/handlers/KS/shared/summonSearch';
import { checkFlexibleUpgrade } from '@/lib/engine/rules/PlayValidation';

/**
 * Card 002/130 - HIRUZEN SARUTOBI "Troisieme Hokage" (UC)
 * Chakra: 5 | Power: 4
 * Group: Leaf Village | Keywords: Hokage
 *
 * MAIN: Play a Leaf Village character anywhere paying 1 less.
 *   - Includes Leaf Village cards in hand AND hidden Leaf Village characters on board.
 *
 * UPGRADE: POWERUP 2 the character played with the MAIN effect.
 */

function handleHiruzen002Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, isUpgrade } = ctx;
  const playerState = state[sourcePlayer];
  const costReduction = 1;

  // Find affordable Leaf Village characters in hand
  const affordableLeafIndices: string[] = [];
  const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  for (let i = 0; i < playerState.hand.length; i++) {
    const card = playerState.hand[i];
    if (card.group !== 'Leaf Village') continue;

    let canPlace = false;
    for (const mission of state.activeMissions) {
      const chars = mission[friendlySide];
      // Find upgrade target: same-name first, then flexible cross-name
      let upgradeTarget: CharacterInPlay | undefined;
      for (const c of chars) {
        if (c.isHidden) continue;
        const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        if (topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase() && (card.chakra ?? 0) > (topCard.chakra ?? 0)) {
          upgradeTarget = c;
          break;
        }
      }
      if (!upgradeTarget) {
        for (const c of chars) {
          if (c.isHidden) continue;
          const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
          if (checkFlexibleUpgrade(card as any, topCard) && (card.chakra ?? 0) > (topCard.chakra ?? 0)) {
            upgradeTarget = c;
            break;
          }
        }
      }

      if (upgradeTarget) {
        const existingTop = upgradeTarget.stack.length > 0
          ? upgradeTarget.stack[upgradeTarget.stack.length - 1]
          : upgradeTarget.card;
        const upgradeCost = Math.max(0, (card.chakra - existingTop.chakra) - costReduction);
        if (playerState.chakra >= upgradeCost) {
          canPlace = true;
          break;
        }
      } else {
        // Check for name conflict (same name but can't upgrade)
        const hasNameConflict = chars.some((c) => {
          if (c.isHidden) return false;
          const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
          return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase();
        });
        if (!hasNameConflict) {
          const freshCost = Math.max(0, card.chakra - costReduction);
          if (playerState.chakra >= freshCost) {
            canPlace = true;
            break;
          }
        }
      }
    }
    if (canPlace) {
      affordableLeafIndices.push(`HAND_${i}`);
    }
  }

  // Find hidden Leaf Village characters on the board
  const hiddenTargets = findHiddenLeafOnBoard(state, sourcePlayer, costReduction);
  const hiddenLeafIds = hiddenTargets.map(h => `HIDDEN_${h.instanceId}`);

  const allTargets = [...affordableLeafIndices, ...hiddenLeafIds];

  if (allTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Hiruzen Sarutobi (002): No affordable Leaf Village character could be played.',
          'game.log.effect.noTarget',
          { card: 'HIRUZEN SARUTOBI', id: 'KS-002-UC' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'HIRUZEN002_CHOOSE_CARD',
    validTargets: allTargets,
    description: JSON.stringify({
      text: isUpgrade
        ? 'Hiruzen Sarutobi (002): Choose a Leaf Village character to play (cost -1, + POWERUP 2).'
        : 'Hiruzen Sarutobi (002): Choose a Leaf Village character to play (cost -1).',
      hiddenChars: hiddenTargets,
      costReduction,
      isUpgrade,
    }),
    descriptionKey: isUpgrade
      ? 'game.effect.desc.hiruzen002PlayLeafUpgrade'
      : 'game.effect.desc.hiruzen002PlayLeaf',
  };
}

/**
 * UPGRADE: POWERUP 2 the character played with the MAIN effect.
 * This is a no-op handler because the POWERUP 2 is already applied
 * in hiruzen002PlaceCard when pending.isUpgrade is true.
 */
function handleHiruzen002Upgrade(ctx: EffectContext): EffectResult {
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('KS-002-UC', 'MAIN', handleHiruzen002Main);
  registerEffect('KS-002-UC', 'UPGRADE', handleHiruzen002Upgrade);
}
