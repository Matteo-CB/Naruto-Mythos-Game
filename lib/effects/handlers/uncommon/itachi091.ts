import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 091/130 - ITACHI UCHIWA "Mangekyo Sharingan" (UC)
 * Chakra: 5 | Power: 5
 * Group: Akatsuki | Keywords: Rogue Ninja, Kekkei Genkai
 *
 * MAIN: Look at a card in the opponent's hand (player picks face-down).
 *
 * UPGRADE: MAIN effect: In addition, the opponent discards that card and draws a card.
 */

function handleItachi091Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, isUpgrade } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const opponentHand = state[opponentPlayer].hand;

  if (opponentHand.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Itachi Uchiwa (091): Opponent has no cards in hand.',
      'game.log.effect.noTarget',
      { card: 'ITACHI UCHIWA', id: 'KS-091-UC' },
    );
    return { state: { ...state, log } };
  }

  // Player chooses which face-down card to look at
  const validTargets = opponentHand.map((_c, i) => String(i));

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ITACHI091_CHOOSE_HAND_CARD',
    validTargets,
    description: JSON.stringify({
      text: 'Itachi Uchiwa (091): Choose a card from the opponent\'s hand to look at.',
      isUpgrade,
    }),
    descriptionKey: 'game.effect.desc.itachi091ChooseHandCard',
  };
}

export function registerItachi091Handlers(): void {
  registerEffect('KS-091-UC', 'MAIN', handleItachi091Main);
}
