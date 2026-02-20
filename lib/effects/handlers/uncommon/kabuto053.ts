import type { EffectContext, EffectResult } from '../../EffectTypes';
import type { CharacterInPlay } from '../../../engine/types';
import { registerEffect } from '../../EffectRegistry';
import { generateInstanceId } from '../../../engine/utils/id';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 053/130 - KABUTO YAKUSHI (UC)
 * Chakra: 4 | Power: 2
 * Group: Sound Village | Keywords: Jutsu
 *
 * UPGRADE: Discard a card from your hand.
 *   - Requires the player to select a card from their hand to discard.
 *   - If the hand is empty, the discard part fizzles.
 *
 * MAIN: Play the character card at the top of your discard pile paying 3 less.
 *   - Check the discard pile. If the top card is a character card, play it on a
 *     mission paying (cost - 3, minimum 0) from the player's chakra pool.
 *   - The played character is placed face-visible on a mission (target selection needed).
 *   - If the discard pile is empty or the top card is not a character, effect fizzles.
 *
 * When triggered as upgrade: first the UPGRADE effect (discard from hand) triggers,
 * then the MAIN effect (play from discard top) triggers. This means the discarded card
 * may become the new top of the discard pile for the MAIN effect.
 */

function handleKabuto053Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, isUpgrade } = ctx;
  const playerState = state[sourcePlayer];

  // If this is an upgrade and player has cards in hand, first ask for discard
  if (isUpgrade && playerState.hand.length > 0) {
    const handIndices = playerState.hand.map((_, i) => String(i));
    return {
      state,
      requiresTargetSelection: true,
      targetSelectionType: 'KABUTO053_DISCARD_FROM_HAND',
      validTargets: handIndices,
      description: 'Kabuto Yakushi (053): Choose a card from your hand to discard (upgrade effect).',
    };
  }

  // MAIN effect: play top of discard pile paying 3 less
  if (playerState.discardPile.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kabuto Yakushi (053): Discard pile is empty. Nothing to play.',
      'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: '053/130' }) } };
  }

  const topDiscard = playerState.discardPile[playerState.discardPile.length - 1];

  // Must be a character card
  if (topDiscard.card_type !== 'character') {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kabuto Yakushi (053): Top of discard pile is not a character card.',
      'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: '053/130' }) } };
  }

  const reducedCost = Math.max(0, (topDiscard.chakra ?? 0) - 3);

  // Check if player can afford it
  if (playerState.chakra < reducedCost) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      `Kabuto Yakushi (053): Not enough chakra to play ${topDiscard.name_fr} (needs ${reducedCost}, has ${playerState.chakra}).`,
      'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: '053/130' }) } };
  }

  // Find valid missions (no same-name conflict)
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const validMissions: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    const hasSameName = mission[friendlySide].some((c) => {
      const tc = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return tc.name_fr === topDiscard.name_fr;
    });
    if (!hasSameName) {
      validMissions.push(String(i));
    }
  }

  if (validMissions.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      `Kabuto Yakushi (053): No valid mission to play ${topDiscard.name_fr} on (name conflict).`,
      'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: '053/130' }) } };
  }

  // If only one valid mission, auto-play
  if (validMissions.length === 1) {
    const missionIdx = parseInt(validMissions[0], 10);
    const newState = playFromDiscard(state, sourcePlayer, missionIdx, reducedCost);
    return { state: newState };
  }

  // Multiple missions: require target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KABUTO053_CHOOSE_MISSION',
    validTargets: validMissions,
    description: `Kabuto Yakushi (053): Choose a mission to play ${topDiscard.name_fr} on (cost ${reducedCost}).`,
  };
}

function playFromDiscard(
  state: import('../../EffectTypes').EffectContext['state'],
  sourcePlayer: import('../../../engine/types').PlayerID,
  missionIdx: number,
  cost: number,
): import('../../EffectTypes').EffectContext['state'] {
  const newState = { ...state };
  const ps = { ...newState[sourcePlayer] };
  const newDiscardPile = [...ps.discardPile];
  const card = newDiscardPile.pop()!;

  ps.chakra -= cost;
  ps.discardPile = newDiscardPile;

  const charInPlay: CharacterInPlay = {
    instanceId: generateInstanceId(),
    card,
    isHidden: false,
    powerTokens: 0,
    stack: [card],
    controlledBy: sourcePlayer,
    originalOwner: sourcePlayer,
    missionIndex: missionIdx,
  };

  const missions = [...state.activeMissions];
  const mission = { ...missions[missionIdx] };
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  mission[friendlySide] = [...mission[friendlySide], charInPlay];
  missions[missionIdx] = mission;

  // Update character count
  let charCount = 0;
  for (const m of missions) {
    charCount += (sourcePlayer === 'player1' ? m.player1Characters : m.player2Characters).length;
  }
  ps.charactersInPlay = charCount;

  newState[sourcePlayer] = ps;
  newState.activeMissions = missions;

  newState.log = logAction(
    state.log,
    state.turn,
    state.phase,
    sourcePlayer,
    'EFFECT',
    `Kabuto Yakushi (053): Played ${card.name_fr} from discard pile on mission ${missionIdx + 1} for ${cost} chakra (3 less).`,
    'game.log.effect.playFromDiscard',
    { card: 'KABUTO YAKUSHI', id: '053/130', target: card.name_fr, mission: String(missionIdx + 1), cost: String(cost) },
  );

  return newState;
}

export function registerKabuto053Handlers(): void {
  registerEffect('053/130', 'MAIN', handleKabuto053Main);
  // UPGRADE triggers the same MAIN handler with ctx.isUpgrade = true
  // The MAIN handler checks isUpgrade to first prompt for discard
}
