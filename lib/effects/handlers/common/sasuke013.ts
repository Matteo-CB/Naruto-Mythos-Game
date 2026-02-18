import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 013/130 - SASUKE UCHIWA (Common)
 * Chakra: 2 | Power: 4
 * MAIN [continuous]: This character has -1 Power for every other non-hidden friendly character
 * in this mission.
 *
 * This is a continuous power modifier handled in PowerCalculation.ts.
 * The handler here is a no-op that registers the card so the system knows it has an effect.
 */
function handleSasuke013Main(ctx: EffectContext): EffectResult {
  // Continuous power modifier - actual calculation happens in PowerCalculation.ts
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('013/130', 'MAIN', handleSasuke013Main);
}
