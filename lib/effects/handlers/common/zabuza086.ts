import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 086/130 - ZABUZA MOMOCHI (Common)
 * Chakra: 3 | Power: 5
 * No effects.
 */
function handleZabuza086Main(ctx: EffectContext): EffectResult {
  // No effects on this card
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('086/130', 'MAIN', handleZabuza086Main);
}
