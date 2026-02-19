import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 144/130 - KISAME HOSHIGAKI "Absorption du chakra" (M)
 * Chakra: 6, Power: 6
 * Group: Akatsuki, Keywords: Rogue Ninja
 *
 * MAIN: Steal 1 Chakra from the opponent pool.
 *   - Reduce opponent's chakra by 1 (minimum 0).
 *   - Increase this player's chakra by 1.
 *   - If opponent has 0 chakra, nothing happens (cannot steal what doesn't exist).
 */

function kisame144MainHandler(ctx: EffectContext): EffectResult {
  const state = { ...ctx.state };
  const opponentId = ctx.sourcePlayer === 'player1' ? 'player2' : 'player1';
  const opponentState = { ...state[opponentId] };
  const playerState = { ...state[ctx.sourcePlayer] };

  if (opponentState.chakra <= 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kisame Hoshigaki (144): Opponent has no chakra to steal.',
      'game.log.effect.noTarget',
      { card: 'KISAME HOSHIGAKI', id: '144/130' },
    );
    return { state: { ...state, log } };
  }

  // Steal 1 chakra
  opponentState.chakra -= 1;
  playerState.chakra += 1;

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_STEAL_CHAKRA',
    `Kisame Hoshigaki (144): Stole 1 Chakra from opponent. Player: ${playerState.chakra}, Opponent: ${opponentState.chakra}.`,
    'game.log.effect.stealChakra',
    { card: 'KISAME HOSHIGAKI', id: '144/130', amount: 1 },
  );

  return {
    state: {
      ...state,
      [ctx.sourcePlayer]: playerState,
      [opponentId]: opponentState,
      log,
    },
  };
}

export function registerKisame144Handlers(): void {
  registerEffect('144/130', 'MAIN', kisame144MainHandler);
}
