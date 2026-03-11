import { registerEffect } from '@/lib/effects/EffectRegistry';
import { ukon124bMainHandler, ukon124bAmbushHandler } from './ukon124b';

/**
 * Card 127/130 - SAKON (R/RA)
 * Chakra: 5 | Power: 5
 * Group: Sound Village | Keywords: Sound Four, Jutsu
 *
 * MAIN [⧗]: You can play this character as an upgrade over any Sound Village character.
 *   → Continuous upgrade-eligibility expansion. No-op handler; logic in PlayValidation.ts.
 *
 * AMBUSH: Hide an enemy character in this mission with Power 5 or less.
 *   → Shared logic with Ukon 124b.
 */

export function registerSakon127Handlers(): void {
  registerEffect('KS-127-R', 'MAIN', ukon124bMainHandler);
  registerEffect('KS-127-R', 'AMBUSH', ukon124bAmbushHandler);
  registerEffect('KS-127-RA', 'MAIN', ukon124bMainHandler);
  registerEffect('KS-127-RA', 'AMBUSH', ukon124bAmbushHandler);
}
