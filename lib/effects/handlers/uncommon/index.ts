/**
 * Uncommon card effect handlers index.
 * Registers all uncommon card handlers with the effect registry.
 */

import { registerHandler as registerHiruzen002 } from './hiruzen002';
import { registerHandler as registerIno020 } from './ino020';
import { registerHandler as registerHinata031 } from './hinata031';
import { registerRockLee039Handlers } from './rockLee039';
import { registerHandler as registerRasa083 } from './rasa083';
import { registerHandler as registerKisame093 } from './kisame093';

/**
 * Register all uncommon card effect handlers with the effect registry.
 * Called once during application initialization.
 */
export function registerAllUncommonHandlers(): void {
  registerHiruzen002();    // 002/130 - HIRUZEN SARUTOBI: Play Leaf Village paying 1 less / UPGRADE POWERUP 2
  registerIno020();        // 020/130 - INO YAMANAKA: Take control enemy cost <=2 (<=3 on upgrade)
  registerHinata031();     // 031/130 - HINATA HYUGA: [continuous] Gain 1 chakra on enemy play in mission
  registerRockLee039Handlers(); // 039/130 - ROCK LEE: [continuous] Keep Power tokens / UPGRADE POWERUP 2
  registerRasa083();       // 083/130 - RASA: SCORE +1 point if Sand Village ally in mission
  registerKisame093();     // 093/130 - KISAME HOSHIGAKI: Steal Power tokens from enemy in play
}
