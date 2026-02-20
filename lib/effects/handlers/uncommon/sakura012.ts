import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 012/130 - SAKURA HARUNO "Maitrise du Chakra" (UC)
 * Chakra: 3 | Power: 2
 * Group: Leaf Village | Keywords: Team 7
 *
 * MAIN [continuous]: CHAKRA +1.
 *   - Continuous effect. The character provides +1 extra chakra during the Start Phase.
 *   - The actual chakra calculation is handled in StartPhase.ts.
 *   - The handler here is a no-op.
 *
 * UPGRADE: Draw 1 card. If you do so, you must discard 1 card.
 *   - When triggered as an upgrade, draw 1 card from deck. If a card was drawn,
 *     the player must discard 1 card from hand. Requires target selection for which
 *     card to discard.
 */
function handleSakura012Main(ctx: EffectContext): EffectResult {
  // Continuous CHAKRA +1 effect - actual calculation happens in StartPhase.ts
  return { state: ctx.state };
}

function handleSakura012Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  let newState = { ...state };
  const ps = { ...newState[sourcePlayer] };

  // Draw 1 card
  if (ps.deck.length === 0) {
    // Cannot draw, effect fizzles (no discard required either since "if you do so")
    return { state: { ...newState, log: logAction(newState.log, newState.turn, newState.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Sakura Haruno (012): Deck is empty, cannot draw (upgrade effect fizzles).',
      'game.log.effect.noTarget', { card: 'SAKURA HARUNO', id: '012/130' }) } };
  }

  const newDeck = [...ps.deck];
  const drawnCard = newDeck.shift()!;
  ps.deck = newDeck;
  ps.hand = [...ps.hand, drawnCard];
  newState[sourcePlayer] = ps;

  newState = { ...newState, log: logAction(
    newState.log, newState.turn, newState.phase, sourcePlayer,
    'EFFECT_DRAW',
    'Sakura Haruno (012): Drew 1 card (upgrade effect). Must discard 1 card.',
    'game.log.effect.draw',
    { card: 'SAKURA HARUNO', id: '012/130', count: 1 },
  ) };

  // Must discard 1 card from hand - requires target selection
  if (ps.hand.length === 0) {
    // Shouldn't happen since we just drew, but guard anyway
    return { state: newState };
  }

  // Build valid targets: indices of cards in hand
  const validTargets = ps.hand.map((_, idx) => `hand_${idx}`);

  if (validTargets.length === 1) {
    // Only one card in hand, auto-discard
    const discardedCard = ps.hand[0];
    const ps2 = { ...newState[sourcePlayer] };
    ps2.hand = [];
    ps2.discardPile = [...ps2.discardPile, discardedCard];
    newState[sourcePlayer] = ps2;

    newState = { ...newState, log: logAction(
      newState.log, newState.turn, newState.phase, sourcePlayer,
      'EFFECT_DISCARD',
      `Sakura Haruno (012): Discarded ${discardedCard.name_fr} (upgrade effect).`,
      'game.log.effect.discard',
      { card: 'SAKURA HARUNO', id: '012/130', target: discardedCard.name_fr },
    ) };

    return { state: newState };
  }

  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'SAKURA_012_DISCARD',
    validTargets,
    description: 'You drew a card. You must discard 1 card from your hand.',
  };
}

export function registerSakura012Handlers(): void {
  registerEffect('012/130', 'MAIN', handleSakura012Main);
  registerEffect('012/130', 'UPGRADE', handleSakura012Upgrade);
}
