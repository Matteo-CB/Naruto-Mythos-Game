import { registerEffect } from '@/lib/effects/EffectRegistry';
import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';

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
  registerEffect('KS-002-MMS', 'SCORE', mss02ScoreHandler);
}
