import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 015/130 - KAKASHI HATAKE (Common)
 * Chakra: 3 | Power: 3
 * MAIN [continuous]: Other Team 7 characters in this mission have +1 Power.
 *
 * This is a continuous power modifier handled in PowerCalculation.ts.
 * The handler here is a no-op that registers the card so the system knows it has an effect.
 */
function handleKakashi015Main(ctx: EffectContext): EffectResult {
  // Continuous power modifier - actual calculation happens in PowerCalculation.ts
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('015/130', 'MAIN', handleKakashi015Main);
}
