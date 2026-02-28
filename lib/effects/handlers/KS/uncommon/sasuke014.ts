import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 014/130 - SASUKE UCHIWA "Sharingan" (UC)
 * Chakra: 3 | Power: 4
 * Group: Leaf Village | Keywords: Team 7, Kekkei Genkai
 *
 * AMBUSH: Look at all cards in the opponent's hand. (Mandatory)
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

  // Capture all opponent hand cards for the reveal
  const allCards = opponentHand.map(c => ({
    name_fr: c.name_fr,
    chakra: c.chakra ?? 0,
    power: c.power ?? 0,
    image_file: c.image_file,
  }));

  const logMsg = isUpgrade
    ? 'Sasuke Uchiwa (014): Looked at all cards in opponent\'s hand (upgrade: may discard one).'
    : 'Sasuke Uchiwa (014): Looked at all cards in opponent\'s hand.';
  const newState = {
    ...state,
    log: logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_LOOK_HAND',
      logMsg,
      'game.log.effect.sasuke014Reveal',
      { card: 'SASUKE UCHIWA', id: 'KS-014-UC' },
    ),
  };

  // Show all opponent hand cards — go directly to SASUKE014_HAND_REVEAL (no choose-one step)
  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'SASUKE014_HAND_REVEAL',
    validTargets: ['confirm'],
    description: JSON.stringify({
      text: isUpgrade
        ? 'Sasuke (014): Opponent\'s hand revealed. You may discard a card to discard one from their hand.'
        : 'Sasuke (014): Opponent\'s hand revealed.',
      cards: allCards,
      isUpgrade,
    }),
    descriptionKey: isUpgrade
      ? 'game.effect.desc.sasuke014RevealUpgrade'
      : 'game.effect.desc.sasuke014Reveal',
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
