import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 142/130 - SASUKE UCHIWA (M)
 * Chakra: 4, Power: 3
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN: Discard a card from hand. If you do, POWERUP X+1 where X = number
 *       of enemy characters in this mission.
 *   - Player must discard a card from hand first (cost).
 *   - If no cards in hand, the effect fizzles.
 *   - Count ALL enemy characters in this mission (including hidden ones).
 *   - Then apply POWERUP (X+1) on self.
 *   - For auto-resolution: discard the lowest-power card from hand.
 */

function sasuke142MainHandler(ctx: EffectContext): EffectResult {
  const state = ctx.state;
  const playerState = state[ctx.sourcePlayer];

  // Check if player has cards in hand to discard
  if (playerState.hand.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Sasuke Uchiwa (142): No cards in hand to discard, effect fizzles.',
      'game.log.effect.noTarget',
      { card: 'SASUKE UCHIWA', id: 'KS-142-M' },
    );
    return { state: { ...state, log } };
  }

  // "If you do" = optional. Always show target selection so player can skip.
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SASUKE142_CHOOSE_DISCARD',
    validTargets: playerState.hand.map((_, i) => String(i)),
    description: 'Sasuke Uchiwa (142): Choose a card from your hand to discard for POWERUP.',
    descriptionKey: 'game.effect.desc.sasuke142Discard',
  };
}

export function registerSasuke142Handlers(): void {
  registerEffect('KS-142-M', 'MAIN', sasuke142MainHandler);
}
