import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 034/130 - YUHI KURENAI (Common)
 * Chakra: 3 | Power: 3
 * MAIN [continuous]: Other Team 8 characters cost 1 less (min 1) to play in this mission.
 *
 * This is a cost modifier handled in ChakraValidation.ts.
 * The handler here is a no-op that registers the card so the system knows it has an effect.
 */
function handleKurenai034Main(ctx: EffectContext): EffectResult {
  // Continuous cost modifier - actual calculation happens in ChakraValidation.ts
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('034/130', 'MAIN', handleKurenai034Main);
}
