import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 042/130 - GAI MAITO (Common)
 * Chakra: 3 | Power: 3
 * MAIN [continuous]: Other Team Guy characters in this mission have +1 Power.
 *
 * This is a continuous power modifier handled in PowerCalculation.ts.
 * The handler here is a no-op that registers the card so the system knows it has an effect.
 */
function handleGai042Main(ctx: EffectContext): EffectResult {
  // Continuous power modifier - actual calculation happens in PowerCalculation.ts
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('042/130', 'MAIN', handleGai042Main);
}
