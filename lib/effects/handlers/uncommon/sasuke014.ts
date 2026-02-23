import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 014/130 - SASUKE UCHIWA "Sharingan" (UC)
 * Chakra: 3 | Power: 4
 * Group: Leaf Village | Keywords: Team 7, Kekkei Genkai
 *
 * AMBUSH: Look at a random card in the opponent's hand.
 *   - Pick 1 random card from the opponent's hand and reveal it via INFO_REVEAL UI.
 *
 * UPGRADE: AMBUSH effect: In addition, discard 1 card from your hand.
 *   If you do so, choose 1 card in the opponent's hand and discard it.
 *   - After the reveal, player discards 1 own card, then picks 1 opponent card to discard.
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

  // Pick a random card from opponent's hand
  const randomIndex = Math.floor(Math.random() * opponentHand.length);
  const revealedCard = opponentHand[randomIndex];

  // Log the look action
  const log = logAction(
    state.log, state.turn, state.phase, sourcePlayer,
    'EFFECT_LOOK_HAND',
    `Sasuke Uchiwa (014): Revealed a random card from opponent's hand: ${revealedCard.name_fr}.`,
    'game.log.effect.sasuke014Reveal',
    { card: 'SASUKE UCHIWA', id: 'KS-014-UC', target: revealedCard.name_fr },
  );

  const newState = { ...state, log };

  // Embed card data as JSON in description (parsed by gameStore for INFO_REVEAL UI)
  const revealData = JSON.stringify({
    text: isUpgrade
      ? `Sasuke (014): Revealed ${revealedCard.name_fr}. You may now discard a card to discard one from the opponent's hand.`
      : `Sasuke (014): Revealed ${revealedCard.name_fr} from opponent's hand.`,
    cardName: revealedCard.name_fr,
    cardCost: revealedCard.chakra,
    cardPower: revealedCard.power,
    cardImageFile: revealedCard.image_file,
    isUpgrade,
    randomIndex,
  });

  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'SASUKE014_HAND_REVEAL',
    validTargets: ['confirm'],
    description: revealData,
    descriptionKey: isUpgrade
      ? 'game.effect.desc.sasuke014RevealUpgrade'
      : 'game.effect.desc.sasuke014Reveal',
    descriptionParams: { target: revealedCard.name_fr },
  };
}

function handleSasuke014Upgrade(ctx: EffectContext): EffectResult {
  // The UPGRADE modifies the AMBUSH effect. When this card is played as an upgrade
  // and then its AMBUSH triggers, the AMBUSH handler checks ctx.isUpgrade.
  // This UPGRADE handler is a no-op since the logic is integrated into the AMBUSH handler.
  return { state: ctx.state };
}

export function registerSasuke014Handlers(): void {
  registerEffect('KS-014-UC', 'AMBUSH', handleSasuke014Ambush);
  registerEffect('KS-014-UC', 'UPGRADE', handleSasuke014Upgrade);
}
