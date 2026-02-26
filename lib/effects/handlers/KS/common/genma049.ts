import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';

/**
 * Card 049/130 - GEMMA SHIRANUI (Common)
 * Chakra: 3 | Power: 3
 * MAIN [continuous]: If a friendly Leaf Village character in this mission would be hidden or
 * defeated by enemy effects, you can defeat this character instead.
 *
 * This is a sacrifice/replacement effect handled in EffectEngine.checkDefeatReplacement().
 * The handler here is a no-op that registers the card so the system knows it has an effect.
 */
function handleGenma049Main(ctx: EffectContext): EffectResult {
  // Sacrifice replacement effect - actual logic handled in EffectEngine.ts
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('KS-049-C', 'MAIN', handleGenma049Main);
}
