import { registerEffect } from '../../EffectRegistry';
import type { EffectContext, EffectResult } from '../../EffectTypes';

/**
 * MSS 10 - "Entrainement au chakra" / "Chakra Training"
 *
 * No effects. This mission has no SCORE effect.
 * Handler registered as a no-op for completeness.
 */

function mss10ScoreHandler(ctx: EffectContext): EffectResult {
  // No effect
  return { state: ctx.state };
}

export function registerMss10Handlers(): void {
  registerEffect('MSS 10', 'SCORE', mss10ScoreHandler);
}
