import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 135/130 - SAKURA HARUNO "Corps Medical du Village de la Feuille" (S)
 * Chakra: 5, Power: 4
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN: Look at the top 3 cards of your deck. Play one character anywhere
 *       and discard the other cards.
 *
 * UPGRADE (effect:): Instead, play the card paying 4 less.
 *
 * Two-stage target selection:
 *   Stage 1: SAKURA135_CHOOSE_CARD — choose which character card from top 3 to play
 *   Stage 2: SAKURA135_CHOOSE_MISSION — choose which mission to play it on
 *
 * The handler draws the top 3 cards and stores them in the pending state.
 * The EffectEngine methods handle the rest.
 */

function sakura135MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];
  const costReduction = ctx.isUpgrade ? 4 : 0;

  if (playerState.deck.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Sakura Haruno (135): Deck is empty, no cards to look at.',
      'game.log.effect.noTarget',
      { card: 'SAKURA HARUNO', id: '135/130' },
    );
    return { state: { ...state, log } };
  }

  // Draw top 3 cards from deck
  const newState = { ...state };
  const ps = { ...newState[sourcePlayer] };
  const deck = [...ps.deck];
  const topCards = deck.splice(0, Math.min(3, deck.length));
  ps.deck = deck;
  newState[sourcePlayer] = ps;

  // Find character cards among them that the player can afford
  const validIndices: string[] = [];
  for (let i = 0; i < topCards.length; i++) {
    if (topCards[i].card_type === 'character') {
      const cost = Math.max(0, topCards[i].chakra - costReduction);
      if (ps.chakra >= cost) {
        validIndices.push(String(i));
      }
    }
  }

  if (validIndices.length === 0) {
    // No affordable character cards — discard all
    ps.discardPile = [...ps.discardPile, ...topCards];
    newState[sourcePlayer] = ps;
    const log = logAction(
      newState.log, newState.turn, newState.phase, sourcePlayer,
      'EFFECT_DISCARD',
      `Sakura Haruno (135): No affordable character in top ${topCards.length} cards, all discarded.`,
      'game.log.effect.discardCards',
      { card: 'SAKURA HARUNO', id: '135/130', count: topCards.length },
    );
    return { state: { ...newState, log } };
  }

  // Store the drawn cards in the discard pile temporarily so the EffectEngine
  // can recover them in the resolution stage. They are appended at the END of
  // the discard pile, and the EffectEngine will splice them back out.
  const cardInfo = topCards.map((c, i) => ({
    index: i,
    name: c.name_fr,
    chakra: c.chakra,
    power: c.card_type === 'character' ? c.power : 0,
    isCharacter: c.card_type === 'character',
  }));

  ps.discardPile = [...ps.discardPile, ...topCards];
  newState[sourcePlayer] = ps;

  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'SAKURA135_CHOOSE_CARD',
    validTargets: validIndices,
    description: JSON.stringify({
      text: ctx.isUpgrade
        ? 'Sakura Haruno (135): Choose a character from the top cards to play (paying 4 less).'
        : 'Sakura Haruno (135): Choose a character from the top cards to play.',
      topCards: cardInfo,
      costReduction,
    }),
  };
}

export function registerSakura135Handlers(): void {
  registerEffect('135/130', 'MAIN', sakura135MainHandler);
}
