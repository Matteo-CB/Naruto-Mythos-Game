import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';

/**
 * Card 060/130 - KIDÔMARU (UC)
 * Chakra: 5 | Power: 3
 * Group: Sound Village | Keywords: Sound Four
 *
 * [⧗] Spider's Rain / Giant Spider — End-of-round optional effect:
 *   At the end of the round, you may hide a character with Power ≤ Kidômaru's printed Power.
 *   If you do, Kidômaru must return to your hand.
 *
 * This card has NO MAIN or AMBUSH play effects.
 * The end-of-round trigger is handled entirely in EndPhase.ts (handleKidomaru060EndOfRound).
 * A no-op handler is registered here so the effect registry does not throw for this card ID.
 */

function kidomaru060NoOp(ctx: EffectContext): EffectResult {
  return { state: ctx.state };
}

export function registerKidomaru060Handlers(): void {
  // No play-time MAIN/AMBUSH effects — end-of-round logic is in EndPhase.ts
  registerEffect('KS-060-UC', 'MAIN', kidomaru060NoOp);
}
