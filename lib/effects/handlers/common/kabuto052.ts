import type { EffectContext, EffectResult } from '../../EffectTypes';
import type { CharacterInPlay } from '../../../engine/types';
import { registerEffect } from '../../EffectRegistry';
import { generateInstanceId } from '../../../engine/utils/id';
import { logAction } from '../../../engine/utils/gameLog';

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
      'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: '052/130' }) } };
  }

  // Draw top card from opponent's deck
  let newState = { ...state };
  const ops = { ...newState[opponentPlayer] };
  const newDeck = [...ops.deck];
  const stolenCard = newDeck.shift()!;
  ops.deck = newDeck;
  newState[opponentPlayer] = ops;

  // Find valid missions to place the hidden character
  // Check for same-name conflict (a player cannot have two characters with the same name in one mission)
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const validMissionIndices: number[] = [];
  for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
    const mission = newState.activeMissions[mIdx];
    const friendlyChars = mission[friendlySide];

    // Hidden characters don't reveal their name, but we still check for visible same-name conflicts
    // Since the card is being placed hidden, name conflicts are only checked for visible characters
    const hasSameNameVisible = friendlyChars.some(c => {
      if (c.isHidden) return false;
      const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return topCard.name_fr === stolenCard.name_fr;
    });

    if (!hasSameNameVisible) {
      validMissionIndices.push(mIdx);
    }
  }

  if (validMissionIndices.length === 0) {
    // No valid mission - effect fizzles, but the card was already drawn from opponent's deck
    // Put it in the opponent's discard pile since it can't be placed
    ops.discardPile = [...ops.discardPile, stolenCard];
    newState[opponentPlayer] = ops;

    return { state: { ...newState, log: logAction(newState.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kabuto Yakushi (052): No valid mission for the stolen card, discarded.',
      'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: '052/130' }) } };
  }

  // Pick the mission with fewest friendly characters
  let bestMissionIdx = validMissionIndices[0];
  let fewestChars = Infinity;
  for (const mIdx of validMissionIndices) {
    const count = newState.activeMissions[mIdx][friendlySide].length;
    if (count < fewestChars) {
      fewestChars = count;
      bestMissionIdx = mIdx;
    }
  }

  // Place the stolen card as a hidden character
  const charInPlay: CharacterInPlay = {
    instanceId: generateInstanceId(),
    card: stolenCard,
    isHidden: true,
    powerTokens: 0,
    stack: [stolenCard],
    controlledBy: sourcePlayer,
    originalOwner: opponentPlayer,
    missionIndex: bestMissionIdx,
  };

  const missions = [...newState.activeMissions];
  const mission = { ...missions[bestMissionIdx] };
  const chars = [...mission[friendlySide]];
  chars.push(charInPlay);
  mission[friendlySide] = chars;
  missions[bestMissionIdx] = mission;
  newState.activeMissions = missions;

  // Update character count
  const ps = { ...newState[sourcePlayer] };
  let charCount = 0;
  for (const m of missions) {
    charCount += (sourcePlayer === 'player1' ? m.player1Characters : m.player2Characters).length;
  }
  ps.charactersInPlay = charCount;
  newState[sourcePlayer] = ps;

  newState.log = logAction(
    state.log, state.turn, state.phase, sourcePlayer,
    'EFFECT',
    `Kabuto Yakushi (052): Drew top card from opponent's deck and placed it hidden on mission ${bestMissionIdx + 1}.`,
    'game.log.effect.kabutoSteal',
    { card: 'KABUTO YAKUSHI', id: '052/130', mission: String(bestMissionIdx + 1) },
  );

  return { state: newState };
}

export function registerHandler(): void {
  registerEffect('052/130', 'AMBUSH', handleKabuto052Ambush);
}
