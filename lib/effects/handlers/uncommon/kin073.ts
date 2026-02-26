import type { EffectContext, EffectResult } from '../../EffectTypes';
import type { CharacterInPlay } from '../../../engine/types';
import { registerEffect } from '../../EffectRegistry';
import { generateInstanceId } from '../../../engine/utils/id';
import { logAction } from '../../../engine/utils/gameLog';
import { getEffectivePower } from '../../powerUtils';

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
  const { state, sourcePlayer } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const playerState = state[sourcePlayer];

  // Check if player has cards in hand to discard
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

  // Find valid enemy targets (non-hidden with effective power <= 4)
  const validEnemyTargets: string[] = [];
  for (const mission of state.activeMissions) {
    const enemyChars =
      opponentPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;
    for (const char of enemyChars) {
      if (!char.isHidden && getEffectivePower(state, char, opponentPlayer) <= 4) {
        validEnemyTargets.push(char.instanceId);
      }
    }
  }

  if (validEnemyTargets.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kin Tsuchi (073): No non-hidden enemy character with Power 4 or less in play.',
      'game.log.effect.noTarget',
      { card: 'KIN TSUCHI', id: 'KS-073-UC' },
    );
    return { state: { ...state, log } };
  }

  // Step 1: Player chooses enemy to hide
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIN073_CHOOSE_ENEMY',
    validTargets: validEnemyTargets,
    description: JSON.stringify({
      text: 'Kin Tsuchi (073): Choose an enemy character with Power 4 or less to hide.',
    }),
    descriptionKey: 'game.effect.desc.kin073ChooseEnemy',
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
