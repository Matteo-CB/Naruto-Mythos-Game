import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';

/**
 * Card 077/130 - KANKURO (Common)
 * Chakra: 3 | Power: 3
 * MAIN [continuous]: If there's at least one non-hidden enemy character in this mission, CHAKRA +1.
 *
 * This is a continuous chakra bonus handled in StartPhase.ts.
 * The handler here is a no-op that registers the card so the system knows it has an effect.
 */
function handleKankuro077Main(ctx: EffectContext): EffectResult {
  // Continuous chakra bonus - actual calculation happens in StartPhase.ts
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('KS-077-C', 'MAIN', handleKankuro077Main);
}
