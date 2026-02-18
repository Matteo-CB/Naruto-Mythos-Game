import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 090/130 - ITACHI UCHIWA (Common)
 * Chakra: 3 | Power: 3
 * MAIN [continuous]: If there is a Sasuke Uchiha in this mission, you can play this character
 * while hidden paying 3 less.
 *
 * This is a cost modifier for hidden play handled in ChakraValidation.ts.
 * The handler here is a no-op that registers the card so the system knows it has an effect.
 */
function handleItachi090Main(ctx: EffectContext): EffectResult {
  // Continuous cost modifier for hidden play - handled in ChakraValidation.ts
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('090/130', 'MAIN', handleItachi090Main);
}
