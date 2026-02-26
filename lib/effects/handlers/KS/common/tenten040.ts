import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';

/**
 * Card 040/130 - TENTEN (Common)
 * Chakra: 1 | Power: 2
 * MAIN [continuous]: You can play this character only in a mission where you are currently winning.
 *
 * This is a play restriction handled in PlayValidation.ts.
 * The handler here is a no-op that registers the card so the system knows it has an effect.
 */
function handleTenten040Main(ctx: EffectContext): EffectResult {
  // Play restriction - actual validation happens in PlayValidation.ts
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('KS-040-C', 'MAIN', handleTenten040Main);
}
