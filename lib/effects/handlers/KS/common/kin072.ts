import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';


function handleKin072Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  if (state[opponentPlayer].deck.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kin Tsuchi (072): Opponent has no cards to draw.',
      'game.log.effect.noTarget',
      { card: 'KIN TSUCHI', id: 'KS-072-C' },
    );
    return { state: { ...state, log } };
  }

  const deck = [...state[opponentPlayer].deck];
  const drawn = deck.shift()!;
  const opponentState = { ...state[opponentPlayer], deck, hand: [...state[opponentPlayer].hand, drawn] };
  const log = logAction(
    state.log, state.turn, state.phase, sourcePlayer,
    'EFFECT_DRAW',
    'Kin Tsuchi (072): Opponent draws 1 card.',
    'game.log.effect.oppDraw',
    { card: 'Kin Tsuchi', id: 'KS-072-C', count: '1' },
  );

  return { state: { ...state, [opponentPlayer]: opponentState, log } };
}

export function registerHandler(): void {
  registerEffect('KS-072-C', 'MAIN', handleKin072Main);
}
