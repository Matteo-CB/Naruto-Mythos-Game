import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * MSS 08 - "Tendre un piege" / "Set a Trap"
 *
 * SCORE [arrow]: Put a card from your hand as a hidden character to any mission.
 *   - The scoring player chooses a card from their hand, then chooses a mission.
 *   - The card is placed face-down (hidden) on the chosen mission.
 *   - No chakra cost is paid for this placement.
 *
 * Two-stage target selection:
 *   Stage 1: MSS08_CHOOSE_CARD - choose which card from hand
 *   Stage 2: MSS08_CHOOSE_MISSION - choose which mission to place it on
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
      { card: 'Tendre un piege', id: 'KS-008-MMS' },
    );
    return { state: { ...state, log } };
  }

  if (state.activeMissions.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'SCORE_NO_TARGET',
      'MSS 08 (Set a Trap): No active missions to place a character on.',
      'game.log.effect.noTarget',
      { card: 'Tendre un piege', id: 'KS-008-MMS' },
    );
    return { state: { ...state, log } };
  }

  // CONFIRM popup before card selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MSS08_CONFIRM_SCORE',
    validTargets: ['KS-008-MMS'],
    description: 'MSS 08 (Set a Trap): Put a card from your hand as a hidden character to any mission.',
    descriptionKey: 'game.effect.desc.mss08ConfirmScore',
  };
}

export function registerMss08Handlers(): void {
  registerEffect('KS-008-MMS', 'SCORE', mss08ScoreHandler);
}
