import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

export const SAKON_036_ID = 'SS-036-C';
export const SAKON_036_NAME = 'SAKON';

function sakon036FirstStrike(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];

  if (playerState.deck.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Sakon (SS-036) FIRST STRIKE: deck is empty, no card drawn.',
          'game.log.effect.ss036EmptyDeck', { card: SAKON_036_NAME, id: SAKON_036_ID }),
      },
    };
  }

  const newDeck = [...playerState.deck];
  const drawnCard = newDeck.shift()!;

  return {
    state: {
      ...state,
      [sourcePlayer]: {
        ...playerState,
        deck: newDeck,
        hand: [...playerState.hand, drawnCard],
      },
      log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_DRAW',
        'Sakon (SS-036) FIRST STRIKE: Drew 1 card.',
        'game.log.effect.draw', { card: SAKON_036_NAME, id: SAKON_036_ID, count: 1 }),
    },
  };
}

export function registerSakon036Handlers(): void {
  registerEffect(SAKON_036_ID, 'FIRST_STRIKE', sakon036FirstStrike);
}
