import type { EffectContext, EffectResult } from '../../EffectTypes';
import type { CharacterInPlay } from '../../../engine/types';
import { registerEffect } from '../../EffectRegistry';
import { generateInstanceId } from '../../../engine/utils/id';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 073/130 - KIN TSUCHI "Genjutsu Bells" (UC)
 * Chakra: 3 | Power: 3
 * Group: Sound Village | Keywords: Team Dosu
 *
 * MAIN: Discard a card from your hand to hide an enemy character with Power 4 or less in play.
 *   - Two-step process:
 *     1. Player selects a card from their hand to discard.
 *     2. Player selects a non-hidden enemy character with effective power <= 4 to hide.
 *   - If no valid enemy targets exist, the effect fizzles (no discard needed).
 *   - Requires target selection (the engine handles multi-step resolution).
 *
 * UPGRADE: Put the top card of your deck as a hidden character in this mission.
 *   - Takes deck[0], places it as a face-down (hidden) character in this mission.
 *   - Uses generateInstanceId() for the new character in play.
 *   - If deck is empty, effect fizzles.
 */

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function handleKin073Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const playerState = state[sourcePlayer];

  // First check if there are valid enemy targets (non-hidden with effective power <= 4)
  const validEnemyTargets: string[] = [];
  for (const mission of state.activeMissions) {
    const enemyChars =
      opponentPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;
    for (const char of enemyChars) {
      if (!char.isHidden && getEffectivePower(char) <= 4) {
        validEnemyTargets.push(char.instanceId);
      }
    }
  }

  // If no valid enemy targets, effect fizzles
  if (validEnemyTargets.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kin Tsuchi (073): No non-hidden enemy character with Power 4 or less in play.',
      'game.log.effect.noTarget',
      { card: 'KIN TSUCHI', id: '073/130' },
    );
    return { state: { ...state, log } };
  }

  // Check if player has cards in hand to discard (excluding the source card itself if still in hand)
  if (playerState.hand.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kin Tsuchi (073): No cards in hand to discard.',
      'game.log.effect.noTarget',
      { card: 'KIN TSUCHI', id: '073/130' },
    );
    return { state: { ...state, log } };
  }

  // Require target selection: first select a card to discard, then select enemy to hide
  // The engine resolves this as a multi-step pending action.
  // We return the enemy targets; the engine pairs this with a discard step.
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'DISCARD_AND_HIDE_ENEMY_POWER_4',
    validTargets: validEnemyTargets,
    description: 'Kin Tsuchi (073): Discard a card from hand, then select a non-hidden enemy character with Power 4 or less in play to hide.',
  };
}

function handleKin073Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const playerState = state[sourcePlayer];

  // If deck is empty, effect fizzles
  if (playerState.deck.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kin Tsuchi (073): Deck is empty, cannot place hidden character.',
      'game.log.effect.noTarget',
      { card: 'KIN TSUCHI', id: '073/130' },
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
    state.log,
    state.turn,
    state.phase,
    sourcePlayer,
    'EFFECT_PLACE_HIDDEN',
    'Kin Tsuchi (073): Placed top card of deck as hidden character in this mission (upgrade).',
    'game.log.effect.placeHidden',
    { card: 'KIN TSUCHI', id: '073/130' },
  );

  return { state: { ...newState, log } };
}

export function registerKin073Handlers(): void {
  registerEffect('073/130', 'MAIN', handleKin073Main);
  registerEffect('073/130', 'UPGRADE', handleKin073Upgrade);
}
