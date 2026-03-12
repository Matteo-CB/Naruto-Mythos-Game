import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 140/130 - ITACHI UCHIWA "Tsukuyomi" (S)
 * Chakra: 7, Power: 7
 * Group: Akatsuki, Keywords: Rogue Ninja, Jutsu
 *
 * MAIN: The opponent discards their entire hand, then draws the same number
 *       of cards discarded in this way.
 *   - Get opponent's hand size.
 *   - Move all cards from opponent's hand to their discard pile.
 *   - Draw that many cards from opponent's deck into their hand.
 *   - If deck runs out, draw as many as available (no penalty).
 *
 * UPGRADE: Defeat a character in play with cost X or less, where X is the
 *          number of cards discarded by the MAIN effect.
 *   - Only triggers when ctx.isUpgrade is true.
 *   - X = number of cards that were discarded (original hand size).
 *   - Find enemy characters in play with chakra cost <= X.
 *   - If multiple, return requiresTargetSelection.
 *   - If exactly 1, auto-apply defeat.
 *   - If none, fizzle the upgrade part.
 */

function itachi140MainHandler(ctx: EffectContext): EffectResult {
  const state = ctx.state;

  const opponentPlayer = ctx.sourcePlayer === 'player1' ? 'player2' : 'player1';
  const opponentState = state[opponentPlayer];

  const handSize = opponentState.hand.length;

  if (handSize === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Itachi Uchiwa (140): Opponent hand is already empty, nothing to discard.',
      'game.log.effect.noTarget',
      { card: 'ITACHI UCHIWA', id: 'KS-140-S' },
    );
    return { state: { ...state, log } };
  }

  // Return CONFIRM popup instead of auto-applying discard+draw
  // The actual discard+draw logic will be executed by the EffectEngine
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ITACHI140_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ isUpgrade: ctx.isUpgrade }),
    descriptionKey: 'game.effect.desc.itachi140ConfirmMain',
  };
}

function itachi140UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler when isUpgrade is true.
  return { state: ctx.state };
}

export function registerItachi140Handlers(): void {
  registerEffect('KS-140-S', 'MAIN', itachi140MainHandler);
  registerEffect('KS-140-S', 'UPGRADE', itachi140UpgradeHandler);
}
