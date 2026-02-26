import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';

/**
 * Card 044/130 - ANKO MITARASHI (Common)
 * Chakra: 2 | Power: 2
 * MAIN [continuous]: If you have at least one other friendly Leaf Village character in this
 * mission, CHAKRA +1.
 *
 * This is a continuous chakra bonus handled in StartPhase.ts.
 * The handler here is a no-op that registers the card so the system knows it has an effect.
 */
function handleAnko044Main(ctx: EffectContext): EffectResult {
  // Continuous chakra bonus - actual calculation happens in StartPhase.ts
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('KS-044-C', 'MAIN', handleAnko044Main);
}
