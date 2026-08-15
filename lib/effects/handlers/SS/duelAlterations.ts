import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';

export const ALTERATIONS_APPLIQUEES_AILLEURS: Record<string, string[]> = {
  'SS-114-R': ['DUEL'],
  'SS-114-MV': ['DUEL'],
  'SS-114-SHINOBIV': ['DUEL'],
  'SS-077-UC': ['DUEL'],
  'SS-130-R': ['DUEL'],
};

function alterationDejaAppliquee(ctx: EffectContext): EffectResult {
  return { state: ctx.state };
}

export function registerDuelAlterationHandlers(): void {
  for (const [id, types] of Object.entries(ALTERATIONS_APPLIQUEES_AILLEURS)) {
    for (const type of types) {
      registerEffect(id, type as never, alterationDejaAppliquee);
    }
  }
}
