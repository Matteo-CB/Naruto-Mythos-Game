import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 084/130 - YASHAMARU (Common)
 * Chakra: 1 | Power: 1
 * MAIN [continuous]: This character has +2 Power if there's a friendly Gaara in this mission.
 *
 * This is a continuous power modifier handled in PowerCalculation.ts.
 * The handler here is a no-op that registers the card so the system knows it has an effect.
 */
function handleYashamaru084Main(ctx: EffectContext): EffectResult {
  // Continuous power modifier - actual calculation happens in PowerCalculation.ts
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('084/130', 'MAIN', handleYashamaru084Main);
}
