/**
 * Secret card effect handlers index.
 * Registers all secret card handlers with the effect registry.
 */

import { registerNaruto133Handlers } from './naruto133';
import { registerSakura135Handlers } from './sakura135';
import { registerSasuke136Handlers } from './sasuke136';
import { registerKakashi137Handlers } from './kakashi137';
import { registerGaara139Handlers } from './gaara139';
import { registerItachi140Handlers } from './itachi140';
import { registerTsunade131Handlers } from './tsunade131';
import { registerJiraiya132Handlers } from './jiraiya132';
import { registerKyubi134Handlers } from './kyubi134';
import { registerOrochimaru138Handlers } from './orochimaru138';

export function registerAllSecretHandlers(): void {
  // Existing handlers
  registerNaruto133Handlers();     // 133/130 - NARUTO: Hide P5+P2 / UPGRADE defeat both
  registerSakura135Handlers();     // 135/130 - SAKURA: Look at top 3, play 1 / UPGRADE -4 cost
  registerSasuke136Handlers();     // 136/130 - SASUKE: Defeat enemy / UPGRADE mutual destruction
  registerKakashi137Handlers();    // 137/130 - KAKASHI: Move self / Hide upgraded enemy
  registerGaara139Handlers();      // 139/130 - GAARA: Defeat P1 all missions / UPGRADE POWERUP X
  registerItachi140Handlers();     // 140/130 - ITACHI: AMBUSH look / MAIN take control

  // New handlers
  registerTsunade131Handlers();    // 131/130 - TSUNADE: POWERUP 1 all Leaf Village
  registerJiraiya132Handlers();    // 132/130 - JIRAYA: Play Summon -5 / UPGRADE force max 2 per mission
  registerKyubi134Handlers();      // 134/130 - KYUBI: [continuous] immune / UPGRADE hide total P6
  registerOrochimaru138Handlers(); // 138/130 - OROCHIMARU: [continuous] upgrade any / UPGRADE +2 points if P6+
}
