import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 075/130 - GAARA (Common, second version)
 * Chakra: 3 | Power: 3
 * MAIN [continuous]: If this character would be moved or defeated by enemy effects, instead
 * hide them.
 * MAIN [continuous]: You can play this character while hidden paying 2 less.
 *
 * Both are continuous effects handled elsewhere:
 * - Defeat/move replacement in EffectEngine.checkDefeatReplacement()
 * - Cost modifier in ChakraValidation.ts
 * The handler here is a no-op that registers the card so the system knows it has effects.
 */
function handleGaara075Main(ctx: EffectContext): EffectResult {
  // Both continuous effects handled elsewhere
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('075/130', 'MAIN', handleGaara075Main);
}
