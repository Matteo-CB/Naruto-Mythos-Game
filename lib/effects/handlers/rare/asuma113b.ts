import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import type { CharacterInPlay } from '../../../engine/types';

/**
 * Card 113b/130 - ASUMA SARUTOBI (R)
 * (This card has a dual ID, using 113/130 with a "b" variant)
 * Chakra: 4, Power: 3
 * Group: Leaf Village, Keywords: Team 10
 *
 * AMBUSH: Draw a card.
 *   When revealed from hidden, draw 1 card from deck.
 *
 * MAIN: Discard a card from hand to defeat a character with Power <= discarded card's Power.
 *   Two-stage target selection:
 *   Stage 1: Choose which card to discard from hand.
 *   Stage 2: Choose a valid character to defeat (power <= discarded card's power).
 */

function asuma113bAmbushHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = { ...state[sourcePlayer] };

  if (playerState.deck.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Asuma Sarutobi (113b) AMBUSH: Deck is empty, cannot draw.',
          'game.log.effect.noTarget',
          { card: 'ASUMA SARUTOBI', id: '113b/130' },
        ),
      },
    };
  }

  // Draw 1 card
  const newDeck = [...playerState.deck];
  const drawnCard = newDeck.shift()!;
  const newHand = [...playerState.hand, drawnCard];

  return {
    state: {
      ...state,
      [sourcePlayer]: {
        ...playerState,
        deck: newDeck,
        hand: newHand,
      },
      log: logAction(
        state.log, state.turn, state.phase, sourcePlayer,
        'EFFECT_DRAW',
        `Asuma Sarutobi (113b) AMBUSH: Drew 1 card.`,
        'game.log.effect.draw',
        { card: 'ASUMA SARUTOBI', id: '113b/130', amount: 1 },
      ),
    },
  };
}

function asuma113bMainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];

  if (playerState.hand.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Asuma Sarutobi (113b): Hand is empty, cannot discard.',
          'game.log.effect.noTarget',
          { card: 'ASUMA SARUTOBI', id: '113b/130' },
        ),
      },
    };
  }

  // Stage 1: Choose which card to discard from hand
  const handIndices = playerState.hand.map((_: unknown, i: number) => String(i));

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ASUMA113B_CHOOSE_DISCARD',
    validTargets: handIndices,
    description: 'Asuma Sarutobi (113b): Choose a card from your hand to discard. Then defeat a character with Power equal to or less than the discarded card\'s Power.',
  };
}

export function registerAsuma113bHandlers(): void {
  registerEffect('113b/130', 'AMBUSH', asuma113bAmbushHandler);
  registerEffect('113b/130', 'MAIN', asuma113bMainHandler);
}
