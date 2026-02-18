import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 096/130 - GAMAKICHI (Common)
 * Chakra: 2 | Power: 3
 * MAIN [continuous]: Pay 1 less to play this character if there's a friendly Naruto Uzumaki
 * in this mission.
 * MAIN [continuous]: At the end of the round, you must return this character to your hand.
 *
 * Both effects are continuous and handled elsewhere:
 * - Cost reduction in ChakraValidation.ts
 * - End-of-round return in EndPhase.ts
 * The handler here is a no-op that registers the card so the system knows it has effects.
 */
function handleGamakichi096Main(ctx: EffectContext): EffectResult {
  // Both continuous effects handled elsewhere
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('096/130', 'MAIN', handleGamakichi096Main);
}
