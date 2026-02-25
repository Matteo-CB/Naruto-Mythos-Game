import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 014/130 - SASUKE UCHIWA "Sharingan" (UC)
 * Chakra: 3 | Power: 4
 * Group: Leaf Village | Keywords: Team 7, Kekkei Genkai
 *
 * AMBUSH: Look at a card in the opponent's hand (player picks face-down).
 *
 * UPGRADE: AMBUSH effect: In addition, discard 1 card from your hand.
 *   If you do so, choose 1 card in the opponent's hand and discard it.
 */

function handleSasuke014Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, isUpgrade } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const opponentHand = state[opponentPlayer].hand;

  if (opponentHand.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Sasuke Uchiwa (014): Opponent has no cards in hand.',
      'game.log.effect.noTarget',
      { card: 'SASUKE UCHIWA', id: 'KS-014-UC' },
    );
    return { state: { ...state, log } };
  }

  // Player chooses which face-down card to look at
  const validTargets = opponentHand.map((_c, i) => String(i));

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SASUKE014_CHOOSE_HAND_CARD',
    validTargets,
    description: JSON.stringify({
      text: 'Sasuke Uchiwa (014): Choose a card from the opponent\'s hand to look at.',
      isUpgrade,
    }),
    descriptionKey: 'game.effect.desc.sasuke014ChooseHandCard',
  };
}

function handleSasuke014Upgrade(ctx: EffectContext): EffectResult {
  // The UPGRADE modifies the AMBUSH effect. The logic is integrated into the AMBUSH handler.
  return { state: ctx.state };
}

export function registerSasuke014Handlers(): void {
  registerEffect('KS-014-UC', 'AMBUSH', handleSasuke014Ambush);
  registerEffect('KS-014-UC', 'UPGRADE', handleSasuke014Upgrade);
}
