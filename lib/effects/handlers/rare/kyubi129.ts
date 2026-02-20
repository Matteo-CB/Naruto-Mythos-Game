import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 129/130 - KYUBI (R)
 * Chakra: 6, Power: 8
 * Group: Independent, Keywords: Summon
 *
 * MAIN [continuous]: Can be played as upgrade over Naruto Uzumaki (regardless of name match).
 *   This is a continuous upgrade-eligibility expansion handled by the engine's
 *   upgrade validation logic. The handler here is a no-op.
 *
 * MAIN [continuous]: Can't be hidden or defeated by enemy effects.
 *   This is a continuous protection effect handled by the engine's
 *   defeat replacement and hide prevention logic. The handler here is a no-op.
 *
 * Both MAIN effects are continuous and require no active resolution.
 */

function kyubi129MainHandler(ctx: EffectContext): EffectResult {
  // Continuous effects:
  // 1. Can be played as upgrade over Naruto Uzumaki
  // 2. Can't be hidden or defeated by enemy effects
  // Both are handled by the engine's validation and protection layers.
  return { state: ctx.state };
}

export function registerKyubi129Handlers(): void {
  registerEffect('129/130', 'MAIN', kyubi129MainHandler);
}
