import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 089/130 - HAKU "Crystal Ice Mirrors" (UC)
 * Chakra: 4 | Power: 3
 * Group: Independent | Keywords: Rogue Ninja, Kekkei Genkai
 *
 * MAIN: Discard the top card of opponent's deck, then POWERUP X on self where
 *   X = the chakra cost of the discarded card.
 *   - Take opponent's deck[0], move to opponent's discard pile.
 *   - Read the discarded card's chakra cost and add that many power tokens to self.
 *   - If opponent's deck is empty, effect fizzles.
 *
 * UPGRADE: MAIN: Instead, discard the top card of YOUR OWN deck (and POWERUP X).
 *   - When triggered as upgrade, the discard is from the player's own deck
 *     instead of the opponent's. POWERUP X is the same (X = cost of discarded card).
 */

function handleHaku089Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex, isUpgrade } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  // Determine whose deck to discard from
  const discardFrom = isUpgrade ? sourcePlayer : opponentPlayer;
  const targetPlayerState = state[discardFrom];

  // If the target deck is empty, effect fizzles
  if (targetPlayerState.deck.length === 0) {
    const deckOwner = isUpgrade ? 'your' : "opponent's";
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      `Haku (089): ${deckOwner} deck is empty. Cannot discard.`,
      'game.log.effect.noTarget',
      { card: 'HAKU', id: '089/130' },
    );
    return { state: { ...state, log } };
  }

  // Discard the top card
  const newState = { ...state };
  const ps = { ...newState[discardFrom] };
  const newDeck = [...ps.deck];
  const discardedCard = newDeck.shift()!;
  ps.deck = newDeck;
  ps.discardPile = [...ps.discardPile, discardedCard];
  newState[discardFrom] = ps;

  // POWERUP X on self, where X = discarded card's chakra cost
  const powerupAmount = discardedCard.chakra || 0;

  const missions = [...newState.activeMissions];
  const mission = { ...missions[sourceMissionIndex] };
  const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const chars = [...mission[friendlySide]];
  const charIndex = chars.findIndex((c) => c.instanceId === sourceCard.instanceId);

  if (charIndex !== -1 && powerupAmount > 0) {
    chars[charIndex] = {
      ...chars[charIndex],
      powerTokens: chars[charIndex].powerTokens + powerupAmount,
    };
    mission[friendlySide] = chars;
    missions[sourceMissionIndex] = mission;
    newState.activeMissions = missions;
  }

  const deckOwner = isUpgrade ? 'own' : "opponent's";
  const upgradeNote = isUpgrade ? ' (upgrade - own deck)' : '';
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    sourcePlayer,
    'EFFECT_DISCARD_AND_POWERUP',
    `Haku (089): Discarded ${discardedCard.name_fr} (cost ${discardedCard.chakra}) from ${deckOwner} deck. POWERUP ${powerupAmount}${upgradeNote}.`,
    'game.log.effect.discardPowerup',
    { card: 'HAKU', id: '089/130', target: discardedCard.name_fr, amount: String(powerupAmount) },
  );

  return { state: { ...newState, log } };
}

export function registerHaku089Handlers(): void {
  registerEffect('089/130', 'MAIN', handleHaku089Main);
  // UPGRADE triggers the same MAIN handler with ctx.isUpgrade = true
  // The MAIN handler checks isUpgrade to discard from own deck instead of opponent's
}
