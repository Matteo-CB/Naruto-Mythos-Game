import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

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
  const state = ctx.state;
  const opponentId = ctx.sourcePlayer === 'player1' ? 'player2' : 'player1';

  if (state[opponentId].chakra <= 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kisame Hoshigaki (144): Opponent has no chakra to steal.',
      'game.log.effect.noTarget',
      { card: 'KISAME HOSHIGAKI', id: 'KS-144-M' },
    );
    return { state: { ...state, log } };
  }

  // Return CONFIRM popup first — EffectEngine will handle the actual steal
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KISAME144_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ opponentChakra: state[opponentId].chakra }),
    descriptionKey: 'game.effect.desc.kisame144ConfirmMain',
  };
}

export function registerKisame144Handlers(): void {
  registerEffect('KS-144-M', 'MAIN', kisame144MainHandler);
}
