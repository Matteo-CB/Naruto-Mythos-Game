import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatEnemyCharacter, defeatFriendlyCharacter } from '../../defeatUtils';
import type { CharacterInPlay } from '../../../engine/types';

/**
 * Card 123/130 - KIMIMARO (R)
 * Chakra: 5, Power: 5
 * Group: Sound Village, Keywords: Sound Five
 *
 * MAIN [continuous]: At end of round, if the controlling player has no cards in hand,
 *   this character must be defeated.
 *   Continuous end-of-round check handled by the engine's EndPhase logic.
 *   The handler here is a no-op that registers the card.
 *
 * UPGRADE: Discard a card from hand to defeat a character with cost 5 or less in play.
 *   Two-stage target selection:
 *   Stage 1: Choose which card to discard from hand.
 *   Stage 2: Choose a character with cost <= 5 in play to defeat.
 */

function kimimaro123MainHandler(ctx: EffectContext): EffectResult {
  // Continuous self-defeat condition - handled by the engine's EndPhase.
  // If the player has no cards in hand at end of round, Kimimaro is defeated.
  return { state: ctx.state };
}

function kimimaro123UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playerState = state[sourcePlayer];

  if (playerState.hand.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kimimaro (123) UPGRADE: Hand is empty, cannot discard.',
          'game.log.effect.noTarget',
          { card: 'KIMIMARO', id: '123/130' },
        ),
      },
    };
  }

  // Check if there are any characters with cost <= 5 in play to defeat
  let hasValidTarget = false;
  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      if (char.instanceId !== sourceCard.instanceId) {
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        if (topCard.chakra <= 5) {
          hasValidTarget = true;
          break;
        }
      }
    }
    if (hasValidTarget) break;
  }

  if (!hasValidTarget) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kimimaro (123) UPGRADE: No character with cost 5 or less in play to defeat.',
          'game.log.effect.noTarget',
          { card: 'KIMIMARO', id: '123/130' },
        ),
      },
    };
  }

  // Stage 1: Choose which card to discard from hand
  const handIndices = playerState.hand.map((_: unknown, i: number) => String(i));

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIMIMARO123_CHOOSE_DISCARD',
    validTargets: handIndices,
    description: 'Kimimaro (123) UPGRADE: Choose a card to discard. Then choose a character with cost 5 or less to defeat.',
  };
}

export function registerKimimaro123Handlers(): void {
  registerEffect('123/130', 'MAIN', kimimaro123MainHandler);
  registerEffect('123/130', 'UPGRADE', kimimaro123UpgradeHandler);
}
