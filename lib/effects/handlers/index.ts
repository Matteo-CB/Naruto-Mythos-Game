/**
 * Master handler registration.
 * Imports and registers all effect handlers from all card sets.
 *
 * To add a new set:
 * 1. Create lib/effects/handlers/{SET_CODE}/ with rarity subdirectories
 * 2. Add an index.ts that exports registerAll{SET}Handlers()
 * 3. Import and call it below
 */
import { registerAllKSHandlers } from './KS/index';

export function registerAllSetHandlers(): void {
  registerAllKSHandlers();
}
