import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { generateInstanceId } from '@/lib/engine/utils/id';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 052/130 - KABUTO YAKUSHI "La taupe" (Common)
 * Chakra: 3 | Power: 3
 * Group: Sound Village
 * AMBUSH: Draw the top card of the opponent's deck and put it hidden in any
 * mission under your control.
 *
 * When revealed from hidden:
 * 1. Draw the top card of the opponent's deck.
 * 2. Place it as a hidden character on any mission (face-down, under source player's control).
 * 3. The card's original owner remains the opponent (if it leaves play, it goes to opponent's discard).
 * 4. If the opponent's deck is empty, effect fizzles.
 * 5. If no valid mission exists (same-name conflict on all missions), effect fizzles.
 */
function handleKabuto052Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  // Check if opponent's deck is empty
  const opponentState = state[opponentPlayer];
  if (opponentState.deck.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kabuto Yakushi (052): Opponent deck is empty, effect fizzles.',
      'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: 'KS-052-C' }) } };
  }

  // Draw top card from opponent's deck
  let newState = { ...state };
  const ops = { ...newState[opponentPlayer] };
  const newDeck = [...ops.deck];
  const stolenCard = newDeck.shift()!;
  ops.deck = newDeck;
  newState[opponentPlayer] = ops;

  // Find valid missions to place the hidden character
  // The stolen card is placed HIDDEN - hidden characters have no visible name,
  // so the same-name restriction does NOT apply. Any mission is valid.
  // The name conflict will only be checked later if/when the hidden card is revealed.
  const validMissionIndices: number[] = [];
  for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
    validMissionIndices.push(mIdx);
  }

  if (validMissionIndices.length === 0) {
    // No valid mission - effect fizzles, but the card was already drawn from opponent's deck
    // Put it in the opponent's discard pile since it can't be placed
    ops.discardPile = [...ops.discardPile, stolenCard];
    newState[opponentPlayer] = ops;

    return { state: { ...newState, log: logAction(newState.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kabuto Yakushi (052): No valid mission for the stolen card, discarded.',
      'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: 'KS-052-C' }) } };
  }

  // Let the player choose which mission
  // Store the stolen card temporarily in the state for retrieval after selection
  newState = {
    ...newState,
    log: logAction(newState.log, state.turn, state.phase, sourcePlayer,
      'EFFECT',
      'Kabuto Yakushi (052): Drew top card from opponent\'s deck. Choose a mission to place it hidden.',
      'game.log.effect.kabutoSteal',
      { card: 'KABUTO YAKUSHI', id: 'KS-052-C' }),
    _pendingHiddenCard: stolenCard,
    _pendingOriginalOwner: opponentPlayer,
  } as typeof newState;

  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'KABUTO_CHOOSE_MISSION',
    validTargets: validMissionIndices.map(String),
    description: 'Kabuto Yakushi (052): Choose a mission to place the stolen card hidden.',
    descriptionKey: 'game.effect.desc.kabuto052PlaceHidden',
  };
}

function placeHiddenCard(
  state: EffectContext['state'],
  stolenCard: import('@/lib/engine/types').CharacterCard,
  missionIdx: number,
  sourcePlayer: import('@/lib/engine/types').PlayerID,
  opponentPlayer: import('@/lib/engine/types').PlayerID,
  friendlySide: 'player1Characters' | 'player2Characters',
): EffectResult {
  const charInPlay: CharacterInPlay = {
    instanceId: generateInstanceId(),
    card: stolenCard,
    isHidden: true,
    wasRevealedAtLeastOnce: false,
    powerTokens: 0,
    stack: [stolenCard],
    controlledBy: sourcePlayer,
    originalOwner: opponentPlayer,
    missionIndex: missionIdx,
  };

  const missions = [...state.activeMissions];
  const mission = { ...missions[missionIdx] };
  const chars = [...mission[friendlySide]];
  chars.push(charInPlay);
  mission[friendlySide] = chars;
  missions[missionIdx] = mission;

  let newState = { ...state, activeMissions: missions };

  const ps = { ...newState[sourcePlayer] };
  let charCount = 0;
  for (const m of missions) {
    charCount += (sourcePlayer === 'player1' ? m.player1Characters : m.player2Characters).length;
  }
  ps.charactersInPlay = charCount;
  newState[sourcePlayer] = ps;

  newState.log = logAction(
    newState.log, newState.turn, newState.phase, sourcePlayer,
    'EFFECT',
    `Kabuto Yakushi (052): Placed stolen card hidden on mission ${missionIdx + 1}.`,
    'game.log.effect.kabutoSteal',
    { card: 'KABUTO YAKUSHI', id: 'KS-052-C', mission: String(missionIdx + 1) },
  );

  return { state: newState };
}

export function registerHandler(): void {
  registerEffect('KS-052-C', 'AMBUSH', handleKabuto052Ambush);
}
