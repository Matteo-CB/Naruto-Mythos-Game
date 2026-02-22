import { registerEffect } from '../../EffectRegistry';
import type { EffectContext, EffectResult } from '../../EffectTypes';

/**
 * MSS 09 - "Proteger le chef" / "Protect the Leader"
 *
 * SCORE: [⧗] Characters with 4 Power or more in this mission have +1 Power.
 *
 * Continuous power bonus handled by ContinuousEffects.ts calculateContinuousPowerModifier().
 * This handler is a no-op — the continuous effect is evaluated during power calculation.
 */

function mss09ScoreHandler(ctx: EffectContext): EffectResult {
  // Continuous [⧗] power bonus — handled by ContinuousEffects.ts
  return { state: ctx.state };
}

export function registerMss09Handlers(): void {
  registerEffect('KS-009-MMS', 'SCORE', mss09ScoreHandler);
}
