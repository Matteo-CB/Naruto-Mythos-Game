import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 025/130 - KIBA INUZUKA (Common)
 * Chakra: 2 | Power: 2
 * MAIN [continuous]: If Akamaru is in the same mission, CHAKRA +1.
 *
 * This is a continuous chakra bonus handled in StartPhase.ts.
 * The handler here is a no-op that registers the card so the system knows it has an effect.
 */
function handleKiba025Main(ctx: EffectContext): EffectResult {
  // Continuous chakra bonus - actual calculation happens in StartPhase.ts
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('025/130', 'MAIN', handleKiba025Main);
}
