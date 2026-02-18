import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 027/130 - AKAMARU (Common)
 * Chakra: 1 | Power: 2
 * MAIN [continuous]: If there isn't a Kiba Inuzuka in this mission at the end of the round,
 * you must return this character to your hand.
 *
 * This is an end-of-round trigger handled in EndPhase.ts.
 * The handler here is a no-op that registers the card so the system knows it has an effect.
 */
function handleAkamaru027Main(ctx: EffectContext): EffectResult {
  // End-of-round return to hand - actual logic handled in EndPhase.ts
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('027/130', 'MAIN', handleAkamaru027Main);
}
