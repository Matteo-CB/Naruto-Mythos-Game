import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 014/130 - SASUKE UCHIWA "Sharingan" (UC)
 * Chakra: 3 | Power: 4
 * Group: Leaf Village | Keywords: Team 7, Kekkei Genkai
 *
 * AMBUSH: Choose 1 card in the opponent's hand (face-down) and look at it. (Mandatory)
 *
 * UPGRADE: AMBUSH effect: In addition, discard 1 card from your hand.
 *   If you do so, the chosen opponent card is also discarded.
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

  const newState = {
    ...state,
    log: logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_LOOK_HAND',
      'Sasuke Uchiwa (014): Choose a card from opponent\'s hand to look at.',
      'game.log.effect.sasuke014Choose',
      { card: 'SASUKE UCHIWA', id: 'KS-014-UC' },
    ),
  };

  // Show opponent's hand as face-down cards — player picks one to reveal
  const validTargets = opponentHand.map((_: unknown, i: number) => String(i));

  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'SASUKE014_CHOOSE_HAND_CARD',
    validTargets,
    description: JSON.stringify({
      text: 'Choose a card from the opponent\'s hand to look at.',
      cardCount: opponentHand.length,
      isUpgrade,
    }),
    descriptionKey: 'game.effect.desc.sasuke014ChooseCard',
    isMandatory: true,
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
