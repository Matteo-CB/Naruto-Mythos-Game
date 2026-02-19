import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import { generateInstanceId } from '../../../engine/utils/id';

/**
 * Card 108/130 - NARUTO UZUMAKI "Believe it!" (RA)
 * Also applies to 108/130 A (Rare Art variant - same effects, handled by registry normalization)
 * Chakra: 4, Power: 5
 * Group: Leaf Village, Keywords: Team 7, Jutsu
 *
 * MAIN: Put the top card of your deck as a hidden character in this mission.
 * AMBUSH: Repeat the MAIN effect.
 *
 * Source: official narutotcgmythos.com (corrected from wrong JSON data)
 */

/**
 * Place the top card of the player's deck as a hidden character in this mission.
 * Returns the updated state after placement.
 */
function placeTopCardAsHidden(ctx: EffectContext, label: string): EffectResult {
  const state = { ...ctx.state };
  const playerState = { ...state[ctx.sourcePlayer] };
  const deck = [...playerState.deck];

  if (deck.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      `Naruto Uzumaki (108) ${label}: Deck is empty, cannot place a hidden character.`,
    );
    return { state: { ...state, log } };
  }

  // Take the top card of the deck
  const topCard = deck.shift()!;
  playerState.deck = deck;
  playerState.charactersInPlay = (playerState.charactersInPlay ?? 0) + 1;

  // Place as hidden character in this mission
  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const missions = [...state.activeMissions];
  const mission = { ...missions[ctx.sourceMissionIndex] };

  const newCharacter = {
    instanceId: generateInstanceId(),
    card: topCard,
    isHidden: true,
    powerTokens: 0,
    stack: [topCard],
    controlledBy: ctx.sourcePlayer,
    originalOwner: ctx.sourcePlayer,
    missionIndex: ctx.sourceMissionIndex,
  };

  mission[friendlySide] = [...mission[friendlySide], newCharacter];
  missions[ctx.sourceMissionIndex] = mission;

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_PLACE_HIDDEN',
    `Naruto Uzumaki (108) ${label}: Placed top card of deck as hidden character in this mission.`,
  );

  return {
    state: {
      ...state,
      activeMissions: missions,
      [ctx.sourcePlayer]: playerState,
      log,
    },
  };
}

function naruto108MainHandler(ctx: EffectContext): EffectResult {
  return placeTopCardAsHidden(ctx, 'MAIN');
}

function naruto108AmbushHandler(ctx: EffectContext): EffectResult {
  return placeTopCardAsHidden(ctx, 'AMBUSH');
}

export function registerNaruto108Handlers(): void {
  registerEffect('108/130', 'MAIN', naruto108MainHandler);
  registerEffect('108/130', 'AMBUSH', naruto108AmbushHandler);
}
