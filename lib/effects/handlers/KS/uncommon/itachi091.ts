import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 091/130 - ITACHI UCHIWA "Mangekyo Sharingan" (UC)
 * Chakra: 5 | Power: 5
 * Group: Akatsuki | Keywords: Rogue Ninja, Kekkei Genkai
 *
 * MAIN: Look at all cards in the opponent's hand. (Mandatory)
 *
 * UPGRADE: MAIN effect: In addition, the opponent discards a random card and draws a card.
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

  // Capture ALL hand cards BEFORE any mutation (for the full-hand reveal)
  const allCardsBefore = opponentHand.map((c, i) => ({
    name_fr: c.name_fr,
    chakra: c.chakra ?? 0,
    power: c.power ?? 0,
    image_file: c.image_file,
    isDiscarded: false,
    originalIndex: i,
  }));

  // Pick a deterministic "random" card from opponent's hand
  // Use actionHistory length as a seed so replays produce the same result
  const seed = (state.actionHistory?.length ?? 0) + opponentHand.length + state.turn;
  const randomIndex = seed % opponentHand.length;
  const revealedCard = opponentHand[randomIndex];

  let newState = { ...state };

  // If UPGRADE: discard the revealed card and draw a replacement (before showing the reveal)
  if (isUpgrade) {
    const oppState = { ...newState[opponentPlayer] };
    const hand = [...oppState.hand];
    const [discarded] = hand.splice(randomIndex, 1);
    oppState.hand = hand;
    oppState.discardPile = [...oppState.discardPile, discarded];

    // Draw 1 card from deck
    const deck = [...oppState.deck];
    if (deck.length > 0) {
      const drawn = deck.splice(0, 1);
      oppState.hand = [...oppState.hand, ...drawn];
      oppState.deck = deck;
    }
    newState = { ...newState, [opponentPlayer]: oppState };

    newState = {
      ...newState,
      log: logAction(
        newState.log, newState.turn, newState.phase, sourcePlayer,
        'EFFECT_LOOK_HAND',
        `Itachi Uchiwa (091): Revealed opponent's hand. Discarded ${revealedCard.name_fr} (upgrade).`,
        'game.log.effect.itachi091RevealUpgrade',
        { card: 'ITACHI UCHIWA', id: 'KS-091-UC', target: revealedCard.name_fr },
      ),
    };

    // Mark the discarded card in the allCards list
    allCardsBefore[randomIndex].isDiscarded = true;
  } else {
    newState = {
      ...newState,
      log: logAction(
        newState.log, newState.turn, newState.phase, sourcePlayer,
        'EFFECT_LOOK_HAND',
        'Itachi Uchiwa (091): Revealed all cards in opponent\'s hand.',
        'game.log.effect.itachi091Reveal',
        { card: 'ITACHI UCHIWA', id: 'KS-091-UC' },
      ),
    };
  }

  // Show all opponent hand cards (with discarded one marked for UPGRADE)
  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'ITACHI091_HAND_REVEAL',
    validTargets: ['confirm'],
    description: JSON.stringify({
      text: isUpgrade
        ? `Itachi (091): Opponent's hand revealed. ${revealedCard.name_fr} was discarded (upgrade).`
        : 'Itachi (091): Opponent\'s hand revealed.',
      cards: allCardsBefore,
      isUpgrade,
    }),
    descriptionKey: isUpgrade
      ? 'game.effect.desc.itachi091RevealUpgrade'
      : 'game.effect.desc.itachi091Reveal',
    descriptionParams: { target: revealedCard.name_fr },
    isMandatory: true,
  };
}

export function registerItachi091Handlers(): void {
  registerEffect('KS-091-UC', 'MAIN', handleItachi091Main);
}
