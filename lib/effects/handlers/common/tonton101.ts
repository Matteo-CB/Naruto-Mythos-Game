import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 101/130 - TON TON (Common)
 * Chakra: 1 | Power: 1
 * MAIN [continuous]: If there's a friendly Tsunade or Shizune in this mission, this character
 * has +1 Power.
 *
 * This is a continuous power modifier handled in PowerCalculation.ts.
 * The handler here is a no-op that registers the card so the system knows it has an effect.
 */
function handleTonton101Main(ctx: EffectContext): EffectResult {
  // Continuous power modifier - actual calculation happens in PowerCalculation.ts
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('101/130', 'MAIN', handleTonton101Main);
}
