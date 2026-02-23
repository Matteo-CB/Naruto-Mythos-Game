import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 091/130 - ITACHI UCHIWA "Mangekyo Sharingan" (UC)
 * Chakra: 5 | Power: 5
 * Group: Akatsuki | Keywords: Rogue Ninja, Kekkei Genkai
 *
 * MAIN: Look at a random card in the opponent's hand.
 *   - Pick 1 random card from the opponent's hand and reveal it to the source player.
 *   - Uses the INFO_REVEAL UI pattern (same as Orochimaru 050 reveal).
 *
 * UPGRADE: MAIN effect: In addition, the opponent discards that card and draws a card.
 *   - The randomly revealed card is auto-discarded from the opponent's hand.
 *   - The opponent draws 1 card from their deck as replacement.
 *   - Both actions happen automatically after the player acknowledges the reveal.
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

  // Pick a random card from opponent's hand
  const randomIndex = Math.floor(Math.random() * opponentHand.length);
  const revealedCard = opponentHand[randomIndex];

  // Log the look action
  const log = logAction(
    state.log, state.turn, state.phase, sourcePlayer,
    'EFFECT_LOOK_HAND',
    `Itachi Uchiwa (091): Revealed a random card from opponent's hand: ${revealedCard.name_fr}.`,
    'game.log.effect.itachi091Reveal',
    { card: 'ITACHI UCHIWA', id: 'KS-091-UC', target: revealedCard.name_fr },
  );

  const newState = { ...state, log };

  // Embed card data as JSON in description (parsed by gameStore for INFO_REVEAL UI)
  const revealData = JSON.stringify({
    text: isUpgrade
      ? `Itachi (091): Revealed ${revealedCard.name_fr}. This card will be discarded.`
      : `Itachi (091): Revealed ${revealedCard.name_fr} from opponent's hand.`,
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
    targetSelectionType: 'ITACHI091_HAND_REVEAL',
    validTargets: ['confirm'],
    description: revealData,
    descriptionKey: isUpgrade
      ? 'game.effect.desc.itachi091RevealUpgrade'
      : 'game.effect.desc.itachi091Reveal',
    descriptionParams: { target: revealedCard.name_fr },
  };
}

export function registerItachi091Handlers(): void {
  registerEffect('KS-091-UC', 'MAIN', handleItachi091Main);
  // UPGRADE triggers the same MAIN handler with ctx.isUpgrade = true
}
