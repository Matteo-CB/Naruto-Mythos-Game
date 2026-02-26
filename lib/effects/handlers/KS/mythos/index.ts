/**
 * Mythos card effect handlers index.
 * Registers all mythos card handlers with the effect registry.
 */

import { registerItachi143Handlers } from './itachi143';
import { registerKisame144Handlers } from './kisame144';
import { registerNaruto141Handlers } from './naruto141';
import { registerSasuke142Handlers } from './sasuke142';
import { registerHandler as registerNaruto145 } from './naruto145';
import { registerHandler as registerSasuke146 } from './sasuke146';
import { registerHandler as registerSakura147 } from './sakura147';
import { registerKakashi148Handlers } from './kakashi148';
import { registerKiba149Handlers } from './kiba149';
import { registerShikamaru150Handlers } from './shikamaru150';
import { registerRockLee151Handlers } from './rockLee151';
import { registerItachi152Handlers } from './itachi152';
import { registerGaara153Handlers } from './gaara153';

export function registerAllMythosHandlers(): void {
  // Existing handlers
  registerItachi143Handlers();     // 143/130 - ITACHI: Move friendly / AMBUSH move enemy
  registerKisame144Handlers();     // 144/130 - KISAME: Steal 1 chakra

  // New handlers
  registerNaruto141Handlers();     // 141/130 - NARUTO: Discard to hide P4 enemy
  registerSasuke142Handlers();     // 142/130 - SASUKE: Discard to POWERUP X+1
  registerNaruto145();             // 145/130 - NARUTO: [continuous] hidden +1 Power if Edge
  registerSasuke146();             // 146/130 - SASUKE: Give Edge, POWERUP 3
  registerSakura147();             // 147/130 - SAKURA: [continuous] CHAKRA +2 if no Edge
  registerKakashi148Handlers();    // 148/130 - KAKASHI: Gain Edge / AMBUSH copy Team 7 effect
  registerKiba149Handlers();       // 149/130 - KIBA: Hide Akamaru+another / UPGRADE defeat both
  registerShikamaru150Handlers();  // 150/130 - SHIKAMARU: [continuous] block hidden / UPGRADE hide P3
  registerRockLee151Handlers();    // 151/130 - ROCK LEE: [continuous] must move / UPGRADE discard POWERUP
  registerItachi152Handlers();     // 152/130 - ITACHI: [continuous] enemy -1 Power / UPGRADE move friendly
  registerGaara153Handlers();      // 153/130 - GAARA: Defeat P1 all missions / UPGRADE POWERUP X
}
