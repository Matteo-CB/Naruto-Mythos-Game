import { registerEffect } from '../../EffectRegistry';
import type { EffectContext, EffectResult } from '../../EffectTypes';

/**
 * MSS 02 - "Examen Chunin" / "Chunin Exam"
 *
 * No effects. This mission has no SCORE effect.
 * Handler registered as a no-op for completeness.
 */

function mss02ScoreHandler(ctx: EffectContext): EffectResult {
  // No effect
  return { state: ctx.state };
}

export function registerMss02Handlers(): void {
  registerEffect('MSS 02', 'SCORE', mss02ScoreHandler);
}
