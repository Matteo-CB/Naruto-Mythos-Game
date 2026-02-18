import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 064/130 - TAYUYA (Common)
 * Chakra: 2 | Power: 1
 * MAIN [continuous]: CHAKRA +X, where X is the number of missions where you have at least one
 * friendly Sound Four character.
 *
 * This is a continuous chakra bonus handled in StartPhase.ts.
 * The handler here is a no-op that registers the card so the system knows it has an effect.
 */
function handleTayuya064Main(ctx: EffectContext): EffectResult {
  // Continuous chakra bonus - actual calculation happens in StartPhase.ts
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('064/130', 'MAIN', handleTayuya064Main);
}
