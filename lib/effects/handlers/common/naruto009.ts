import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 009/130 - NARUTO UZUMAKI (Common)
 * Chakra: 2 | Power: 3
 * No effects.
 */
function handleNaruto009Main(ctx: EffectContext): EffectResult {
  // No effects on this card
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('009/130', 'MAIN', handleNaruto009Main);
}
