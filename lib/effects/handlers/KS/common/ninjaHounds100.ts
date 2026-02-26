import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';

/**
 * Card 100/130 - CHIENS NINJAS / NINJA HOUNDS (Common)
 * Chakra: 1 | Power: 1
 * MAIN [continuous]: When this character moves to a different mission, look at a hidden
 * character in that mission.
 *
 * This is a continuous move trigger. The actual reveal logic is handled when move actions
 * are resolved in the game engine. The handler here is a no-op that registers the card
 * so the system knows it has an effect.
 */
function handleNinjaHounds100Main(ctx: EffectContext): EffectResult {
  // Continuous move trigger - actual logic handled in move resolution
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('KS-100-C', 'MAIN', handleNinjaHounds100Main);
}
