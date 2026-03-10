import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 146/130 - SASUKE UCHIWA (M)
 * Chakra: 3, Power: 2
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN: Give the Edge token to opponent. If you do, POWERUP 3 (self).
 *   - The player must currently HOLD the Edge token to "give" it.
 *   - If the player does not hold the Edge, the effect fizzles entirely.
 *   - If the player holds the Edge: transfer it to opponent, then POWERUP 3 on self.
 */

function sasuke146MainHandler(ctx: EffectContext): EffectResult {
  const state = ctx.state;

  // "Give the Edge to the opponent. If you do so, POWERUP 3."
  // You can only give the Edge if you hold it.
  if (state.edgeHolder !== ctx.sourcePlayer) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, ctx.sourcePlayer,
          'EFFECT_NO_TARGET',
          'Sasuke Uchiwa (146): Does not hold the Edge token - cannot give it. Effect fizzles.',
          'game.log.effect.noTarget',
          { card: 'SASUKE UCHIWA', id: 'KS-146-M' },
        ),
      },
    };
  }

  // Effect is optional ("If you do") - route through pending action so player can skip.
  // The "target" is Sasuke himself (confirms the player wants to activate the effect).
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SASUKE146_GIVE_EDGE',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ sourceMissionIndex: ctx.sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.sasuke146GiveEdge',
  };
}

export function registerHandler(): void {
  registerEffect('KS-146-M', 'MAIN', sasuke146MainHandler);
}
