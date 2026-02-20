import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 005/130 - SHIZUNE "Assistante de Tsunade" (Common)
 * Chakra: 2 | Power: 1
 * Group: Leaf Village
 * MAIN [continuous]: CHAKRA +1.
 *
 * This is a continuous effect. The character provides +1 extra chakra during
 * the Start Phase (in addition to the normal +1 per character in play).
 * The actual chakra calculation is handled in StartPhase.ts.
 * The handler here is a no-op that registers the card so the system knows it has an effect.
 */
function handleShizune005Main(ctx: EffectContext): EffectResult {
  // Continuous CHAKRA +1 effect - actual calculation happens in StartPhase.ts
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('005/130', 'MAIN', handleShizune005Main);
}
