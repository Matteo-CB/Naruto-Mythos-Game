import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { generateInstanceId } from '@/lib/engine/utils/id';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';

/**
 * Card 073/130 - KIN TSUCHI "Bell Sound Clone" (UC)
 * Chakra: 4 | Power: 4
 * Group: Sound Village | Keywords: Sound Ninja, Jutsu
 *
 * MAIN: Discard a card from your hand to hide an enemy character with Power 4 or less.
 *   - Two-step process:
 *     Step 1 (KIN073_CHOOSE_ENEMY): Player selects a non-hidden enemy with power <= 4 to hide.
 *     Step 2 (KIN073_CHOOSE_DISCARD): Player selects a card from hand to discard as cost.
 *   - If no valid enemy targets exist, the effect fizzles.
 *   - If hand is empty, the effect fizzles.
 *   - Effect is optional (no "you must").
 *
 * UPGRADE: Put the top card of your deck as a hidden character in this mission.
 *   - Takes deck[0], places it as a face-down (hidden) character in this mission.
 *   - If deck is empty, effect fizzles.
 */

function handleKin073Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const playerState = state[sourcePlayer];

  // Check if player has cards in hand to discard (cost)
  if (playerState.hand.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kin Tsuchi (073): No cards in hand to discard.',
      'game.log.effect.noTarget',
      { card: 'KIN TSUCHI', id: 'KS-073-UC' },
    );
    return { state: { ...state, log } };
  }

  // Check that there is at least one valid enemy target IN THIS MISSION ONLY
  const thisMission = state.activeMissions[sourceMissionIndex];
  const enemyCharsHere = opponentPlayer === 'player1'
    ? thisMission.player1Characters
    : thisMission.player2Characters;
  const hasValidTarget = enemyCharsHere.some(
    (char) => !char.isHidden && getEffectivePower(state, char, opponentPlayer) <= 4,
  );

  if (!hasValidTarget) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kin Tsuchi (073): No non-hidden enemy with Power 4 or less in this mission.',
      'game.log.effect.noTarget',
      { card: 'KIN TSUCHI', id: 'KS-073-UC' },
    );
    return { state: { ...state, log } };
  }

  // Step 1: Player chooses a card from hand to discard (cost)
  const handIndices = playerState.hand.map((_, i) => String(i));
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIN073_CHOOSE_DISCARD',
    validTargets: handIndices,
    description: JSON.stringify({ missionIndex: sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.kin073ChooseDiscard',
  };
}

function handleKin073Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const playerState = state[sourcePlayer];

  // If deck is empty, effect fizzles
  if (playerState.deck.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kin Tsuchi (073): Deck is empty, cannot place hidden character.',
      'game.log.effect.noTarget',
      { card: 'KIN TSUCHI', id: 'KS-073-UC' },
    );
    return { state: { ...state, log } };
  }

  // Take the top card from the deck
  const newState = { ...state };
  const ps = { ...newState[sourcePlayer] };
  const newDeck = [...ps.deck];
  const topCard = newDeck.shift()!;
  ps.deck = newDeck;

  // Place it as a hidden character in this mission
  const charInPlay: CharacterInPlay = {
    instanceId: generateInstanceId(),
    card: topCard,
    isHidden: true,
    wasRevealedAtLeastOnce: false,
    powerTokens: 0,
    stack: [topCard],
    controlledBy: sourcePlayer,
    originalOwner: sourcePlayer,
    missionIndex: sourceMissionIndex,
  };

  const missions = [...newState.activeMissions];
  const mission = { ...missions[sourceMissionIndex] };
  const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  mission[friendlySide] = [...mission[friendlySide], charInPlay];
  missions[sourceMissionIndex] = mission;

  // Update character count
  let charCount = 0;
  for (const m of missions) {
    charCount += (sourcePlayer === 'player1' ? m.player1Characters : m.player2Characters).length;
  }
  ps.charactersInPlay = charCount;

  newState[sourcePlayer] = ps;
  newState.activeMissions = missions;

  const log = logAction(
    state.log, state.turn, state.phase, sourcePlayer,
    'EFFECT_PLACE_HIDDEN',
    'Kin Tsuchi (073): Placed top card of deck as hidden character in this mission (upgrade).',
    'game.log.effect.placeHidden',
    { card: 'KIN TSUCHI', id: 'KS-073-UC' },
  );

  return { state: { ...newState, log } };
}

export function registerKin073Handlers(): void {
  registerEffect('KS-073-UC', 'MAIN', handleKin073Main);
  registerEffect('KS-073-UC', 'UPGRADE', handleKin073Upgrade);
}
