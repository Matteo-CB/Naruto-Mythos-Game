import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 094/130 - GAMA BUNTA (Common)
 * Chakra: 3 | Power: 6
 * MAIN [continuous]: At the end of the round, you must return this character to your hand.
 *
 * This is an end-of-round trigger handled in EndPhase.ts.
 * The handler here is a no-op that registers the card so the system knows it has an effect.
 */
function handleGamabunta094Main(ctx: EffectContext): EffectResult {
  // End-of-round return to hand - actual logic handled in EndPhase.ts
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('094/130', 'MAIN', handleGamabunta094Main);
}
