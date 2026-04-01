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
  const { state, sourcePlayer, sourceCard } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  // Check if opponent's deck is empty
  const opponentState = state[opponentPlayer];
  if (opponentState.deck.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kabuto Yakushi (052): Opponent deck is empty, effect fizzles.',
      'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: 'KS-052-C' }) } };
  }

  // Confirmation popup (optional — player can skip)
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KABUTO052_CONFIRM_AMBUSH',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.kabuto052ConfirmAmbush',
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
