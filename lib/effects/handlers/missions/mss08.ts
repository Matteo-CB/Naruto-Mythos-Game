import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * MSS 08 - "Tendre un piege" / "Set a Trap"
 *
 * SCORE [arrow]: Put a card from your hand as a hidden character to any mission.
 *   - The scoring player chooses a card from their hand, then chooses a mission.
 *   - The card is placed face-down (hidden) on the chosen mission.
 *   - No chakra cost is paid for this placement.
 *
 * Two-stage target selection:
 *   Stage 1: MSS08_CHOOSE_CARD — choose which card from hand
 *   Stage 2: MSS08_CHOOSE_MISSION — choose which mission to place it on
 */

function mss08ScoreHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];

  if (playerState.hand.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'SCORE_NO_TARGET',
      'MSS 08 (Set a Trap): No cards in hand to place as hidden.',
      'game.log.effect.noTarget',
      { card: 'Tendre un piege', id: 'MSS 08' },
    );
    return { state: { ...state, log } };
  }

  if (state.activeMissions.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'SCORE_NO_TARGET',
      'MSS 08 (Set a Trap): No active missions to place a character on.',
      'game.log.effect.noTarget',
      { card: 'Tendre un piege', id: 'MSS 08' },
    );
    return { state: { ...state, log } };
  }

  // Stage 1: choose which card from hand
  const handIndices = playerState.hand.map((_, i) => String(i));

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MSS08_CHOOSE_CARD',
    validTargets: handIndices,
    description: 'MSS 08 (Set a Trap): Choose a card from your hand to place as a hidden character.',
  };
}

export function registerMss08Handlers(): void {
  registerEffect('MSS 08', 'SCORE', mss08ScoreHandler);
}
