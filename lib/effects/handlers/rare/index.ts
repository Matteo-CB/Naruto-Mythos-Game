/**
 * Rare card effect handlers index.
 * Registers all rare card handlers with the effect registry.
 */

import { registerNaruto108Handlers } from './naruto108';
import { registerGaara120Handlers } from './gaara120';
import { registerSakura109Handlers } from './sakura109';
import { registerChoji112Handlers } from './choji112';
import { registerTsunade104Handlers } from './tsunade104';
import { registerJiraiya105Handlers } from './jiraiya105';
import { registerKakashi106Handlers } from './kakashi106';
import { registerSasuke107Handlers } from './sasuke107';
import { registerShikamaru111Handlers } from './shikamaru111';
import { registerKiba113Handlers } from './kiba113';
import { registerAsuma113bHandlers } from './asuma113b';
import { registerHinata114Handlers } from './hinata114';
import { registerNeji116Handlers } from './neji116';
import { registerKurenai116bHandlers } from './kurenai116b';
import { registerRockLee117Handlers } from './rockLee117';
import { registerKankuro119Handlers } from './kankuro119';
import { registerGuy119bHandlers } from './guy119b';
import { registerTemari121Handlers } from './temari121';
import { registerJirobo122Handlers } from './jirobo122';
import { registerKimimaro123Handlers } from './kimimaro123';
import { registerKidomaru124Handlers } from './kidomaru124';
import { registerUkon124bHandlers } from './ukon124b';
import { registerTayuya125Handlers } from './tayuya125';
import { registerOrochimaru126Handlers } from './orochimaru126';
import { registerItachi128Handlers } from './itachi128';
import { registerKyubi129Handlers } from './kyubi129';
import { registerIchibi130Handlers } from './ichibi130';

export function registerAllRareHandlers(): void {
  // Existing handlers
  registerNaruto108Handlers();    // 108/130 - NARUTO UZUMAKI: Hide enemy P3 / UPGRADE POWERUP X
  registerGaara120Handlers();     // 120/130 - GAARA: Defeat P1 all missions / UPGRADE POWERUP X
  registerSakura109Handlers();    // 109/130 - SAKURA HARUNO: Play Leaf from discard / UPGRADE -2 cost
  registerChoji112Handlers();     // 112/130 - CHOJI AKIMICHI: Discard to POWERUP X / UPGRADE repeat

  // New handlers
  registerTsunade104Handlers();   // 104/130 - TSUNADE: Spend extra chakra as POWERUP
  registerJiraiya105Handlers();   // 105/130 - JIRAYA: Play Summon -3 / UPGRADE move enemy
  registerKakashi106Handlers();   // 106/130 - KAKASHI: Discard top of upgraded enemy / UPGRADE copy
  registerSasuke107Handlers();    // 107/130 - SASUKE: Must move friendly / UPGRADE POWERUP X
  registerShikamaru111Handlers(); // 111/130 - SHIKAMARU: [continuous] block hidden play / UPGRADE hide P3
  registerKiba113Handlers();      // 113/130 - KIBA: Hide Akamaru+another / UPGRADE defeat both
  registerAsuma113bHandlers();    // 113b/130 - ASUMA: AMBUSH draw / MAIN discard to defeat
  registerHinata114Handlers();    // 114/130 - HINATA: POWERUP 2+1 / UPGRADE remove all tokens
  registerNeji116Handlers();      // 116/130 - NEJI: Defeat exact P4 / UPGRADE P6
  registerKurenai116bHandlers();  // 116b/130 - KURENAI: AMBUSH defeat P4 / UPGRADE move self
  registerRockLee117Handlers();   // 117/130 - ROCK LEE: [continuous] must move / UPGRADE discard POWERUP
  registerKankuro119Handlers();   // 119/130 - KANKURO: UPGRADE move any / MAIN defeat P3
  registerGuy119bHandlers();      // 119b/130 - MIGHT GUY: UPGRADE POWERUP 3 / MAIN discard+move enemies
  registerTemari121Handlers();    // 121/130 - TEMARI: Move friendly / UPGRADE move any
  registerJirobo122Handlers();    // 122/130 - JIROBO: POWERUP X (chars in mission) / UPGRADE defeat P1
  registerKimimaro123Handlers();  // 123/130 - KIMIMARO: [continuous] defeat if no hand / UPGRADE discard+defeat
  registerKidomaru124Handlers();  // 124/130 - KIDOMARU: AMBUSH defeat P3 other mission / UPGRADE P5
  registerUkon124bHandlers();     // 124b/130 - UKON: [continuous] upgrade Sound Village / AMBUSH hide P5
  registerTayuya125Handlers();    // 125/130 - TAYUYA: [continuous] +1 cost / UPGRADE play Sound -2
  registerOrochimaru126Handlers(); // 126/130 - OROCHIMARU: SCORE defeat weakest / UPGRADE POWERUP 3
  registerItachi128Handlers();    // 128/130 - ITACHI: UPGRADE move friendly / [continuous] enemy -1 Power
  registerKyubi129Handlers();     // 129/130 - KYUBI: [continuous] upgrade over Naruto / immune
  registerIchibi130Handlers();    // 130/130 - ICHIBI: [continuous] immune / UPGRADE defeat all hidden in mission
}
