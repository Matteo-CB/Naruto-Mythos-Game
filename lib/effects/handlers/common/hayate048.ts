import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 048/130 - HAYATE GEKKO (Common)
 * Chakra: 3 | Power: 3
 * MAIN [continuous]: If this character would be defeated, hide it instead.
 *
 * This is a defeat replacement effect handled in EffectEngine.checkDefeatReplacement().
 * The handler here is a no-op that registers the card so the system knows it has an effect.
 */
function handleHayate048Main(ctx: EffectContext): EffectResult {
  // Defeat replacement effect - actual logic handled in EffectEngine.ts
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('048/130', 'MAIN', handleHayate048Main);
}
