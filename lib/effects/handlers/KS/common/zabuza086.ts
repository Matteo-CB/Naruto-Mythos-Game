import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';

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
  registerEffect('KS-086-C', 'MAIN', handleZabuza086Main);
}
