import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 003/130 - TSUNADE (Common)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Sannin
 * MAIN [continuous]: When any friendly character is defeated, gain 2 Chakra.
 *
 * This is a continuous effect that triggers when any friendly character is defeated.
 * The actual trigger logic is handled in the defeat resolution code of the game engine
 * (when a character is defeated, the engine checks for on-defeat triggers like Tsunade's).
 * The handler on play is a no-op since the effect is passive/continuous.
 */
function handleTsunade003Main(ctx: EffectContext): EffectResult {
  // Continuous on-defeat trigger - the actual chakra gain is handled in the game engine
  // when defeat resolution occurs and checks for Tsunade 003 being face-visible in play.
  return { state: ctx.state };
}

export function registerHandler(): void {
  registerEffect('003/130', 'MAIN', handleTsunade003Main);
}
