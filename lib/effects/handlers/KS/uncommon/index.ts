/**
 * Uncommon card effect handlers index.
 * Registers all uncommon card handlers with the effect registry.
 */

import { registerHandler as registerHiruzen002 } from './hiruzen002';
import { registerTsunade004Handlers } from './tsunade004';
import { registerShizune006Handlers } from './shizune006';
import { registerJiraiya008Handlers } from './jiraiya008';
import { registerHandler as registerNaruto010 } from './naruto010';
import { registerSakura012Handlers } from './sakura012';
import { registerSasuke014Handlers } from './sasuke014';
import { registerKakashi016Handlers } from './kakashi016';
import { registerChoji018Handlers } from './choji018';
import { registerHandler as registerIno020 } from './ino020';
import { registerHandler as registerShikamaru022 } from './shikamaru022';
import { registerHandler as registerAsuma024 } from './asuma024';
import { registerKiba026Handlers } from './kiba026';
import { registerAkamaru028Handlers } from './akamaru028';
import { registerAkamaru029Handlers } from './akamaru029';
import { registerHandler as registerHinata031 } from './hinata031';
import { registerShino033Handlers } from './shino033';
import { registerKurenai035Handlers } from './kurenai035';
import { registerNeji037Handlers } from './neji037';
import { registerRockLee039Handlers } from './rockLee039';
import { registerTenten041Handlers } from './tenten041';
import { registerGai043Handlers } from './gai043';
import { registerHandler as registerAnko045 } from './anko045';
import { registerOrochimaru051Handlers } from './orochimaru051';
import { registerKabuto053Handlers } from './kabuto053';
import { registerKabuto054Handlers } from './kabuto054';
import { registerKimimaro056Handlers } from './kimimaro056';
import { registerJirobo058Handlers } from './jirobo058';
import { registerKidomaru060Handlers } from './kidomaru060';
import { registerHandler as registerSakon062 } from './sakon062';
import { registerHandler as registerUkon063 } from './ukon063';
import { registerTayuya065Handlers } from './tayuya065';
import { registerDoki066Handlers } from './doki066';
import { registerHandler as registerRempart067 } from './rempart067';
import { registerDosu069Handlers } from './dosu069';
import { registerZaku071Handlers } from './zaku071';
import { registerKin073Handlers } from './kin073';
import { registerHandler as registerIchibi076 } from './ichibi076';
import { registerKankuro078Handlers } from './kankuro078';
import { registerTemari080Handlers } from './temari080';
import { registerBaki082Handlers } from './baki082';
import { registerHandler as registerRasa083 } from './rasa083';
import { registerHandler as registerYashamaru085 } from './yashamaru085';
import { registerZabuza087Handlers } from './zabuza087';
import { registerHaku089Handlers } from './haku089';
import { registerItachi091Handlers } from './itachi091';
import { registerHandler as registerKisame093 } from './kisame093';
import { registerManda102Handlers } from './manda102';
import { registerHandler as registerKyodaigumo103 } from './kyodaigumo103';

/**
 * Register all uncommon card effect handlers with the effect registry.
 * Called once during application initialization.
 */
export function registerAllUncommonHandlers(): void {
  registerHiruzen002();         // 002/130 - HIRUZEN SARUTOBI: Play Leaf Village paying 1 less / UPGRADE POWERUP 2
  registerTsunade004Handlers(); // 004/130 - TSUNADE: [continuous] Defeated go to hand / UPGRADE discard to hand
  registerShizune006Handlers(); // 006/130 - SHIZUNE: Move enemy Power 3 or less / UPGRADE +2 chakra
  registerJiraiya008Handlers(); // 008/130 - JIRAYA: Play Summon paying 2 less / UPGRADE hide enemy cost 3
  registerNaruto010();          // 010/130 - NARUTO UZUMAKI: AMBUSH move self
  registerSakura012Handlers();  // 012/130 - SAKURA HARUNO: [continuous] CHAKRA +1 / UPGRADE draw+discard
  registerSasuke014Handlers();  // 014/130 - SASUKE UCHIWA: AMBUSH look at hand / UPGRADE discard exchange
  registerKakashi016Handlers(); // 016/130 - KAKASHI HATAKE: Copy enemy effect cost 4 / UPGRADE no limit
  registerChoji018Handlers();   // 018/130 - CHOJI AKIMICHI: [continuous] hide on move / UPGRADE move self
  registerIno020();             // 020/130 - INO YAMANAKA: Take control enemy cost <=2 (<=3 upgrade)
  registerShikamaru022();       // 022/130 - SHIKAMARU NARA: AMBUSH move enemy from previous turn
  registerAsuma024();           // 024/130 - ASUMA SARUTOBI: AMBUSH draw, discard to POWERUP 3
  registerKiba026Handlers();    // 026/130 - KIBA INUZUKA: Hide lowest cost enemy / UPGRADE find Akamaru
  registerAkamaru028Handlers(); // 028/130 - AKAMARU: [continuous] return / AMBUSH POWERUP 2 Kiba
  registerAkamaru029Handlers(); // 029/130 - AKAMARU: [continuous] upgrade over Kiba / UPGRADE hide lowest
  registerHinata031();          // 031/130 - HINATA HYUGA: [continuous] Gain 1 chakra on enemy play
  registerShino033Handlers();   // 033/130 - SHINO ABURAME: AMBUSH cost reduction / UPGRADE move self
  registerKurenai035Handlers(); // 035/130 - YUHI KURENAI: [continuous] block moves / UPGRADE defeat P1
  registerNeji037Handlers();    // 037/130 - NEJI HYUGA: [continuous] POWERUP on enemy play / UPGRADE remove tokens
  registerRockLee039Handlers(); // 039/130 - ROCK LEE: [continuous] Keep Power tokens / UPGRADE POWERUP 2
  registerTenten041Handlers();  // 041/130 - TENTEN: Defeat hidden / UPGRADE POWERUP 1 Leaf Village
  registerGai043Handlers();     // 043/130 - GAI MAITO: [continuous] Keep tokens / UPGRADE POWERUP 3
  registerAnko045();            // 045/130 - ANKO MITARASHI: AMBUSH defeat hidden enemy in play
  registerOrochimaru051Handlers(); // 051/130 - OROCHIMARU: [continuous] move on loss / UPGRADE defeat hidden
  registerKabuto053Handlers();  // 053/130 - KABUTO YAKUSHI: UPGRADE discard / MAIN play from discard -3
  registerKabuto054Handlers();  // 054/130 - KABUTO YAKUSHI: UPGRADE POWERUP 1 / MAIN hide all weaker
  registerKimimaro056Handlers(); // 056/130 - KIMIMARO: [continuous] enemy pays 1 / UPGRADE discard to hide
  registerJirobo058Handlers();  // 058/130 - JIROBO: POWERUP 1 Sound Four / UPGRADE all missions
  registerKidomaru060Handlers(); // 060/130 - KIDOMARU: Move from mission / AMBUSH defeat P1
  registerSakon062();           // 062/130 - SAKON: AMBUSH copy Sound Four effect
  registerUkon063();            // 063/130 - UKON: [continuous] upgrade over Sound Village
  registerTayuya065Handlers();  // 065/130 - TAYUYA: AMBUSH POWERUP 2 Sound / UPGRADE find Summons
  registerDoki066Handlers();    // 066/130 - DOKI: Steal 1 chakra if Sound Four / [continuous] return
  registerRempart067();         // 067/130 - REMPART: [continuous] strongest enemy P=0 / return
  registerDosu069Handlers();    // 069/130 - DOSU KINUTA: UPGRADE look hidden / MAIN force reveal or defeat
  registerZaku071Handlers();    // 071/130 - ZAKU ABUMI: Move enemy if fewer / UPGRADE POWERUP 2
  registerKin073Handlers();     // 073/130 - KIN TSUCHI: Discard to hide P4 / UPGRADE deck to hidden
  registerIchibi076();          // 076/130 - ICHIBI: [continuous] upgrade Gaara / immune
  registerKankuro078Handlers(); // 078/130 - KANKURO: AMBUSH move P4 / UPGRADE play hidden -1
  registerTemari080Handlers();  // 080/130 - TEMARI: Move Sand Village / UPGRADE move self
  registerBaki082Handlers();    // 082/130 - BAKI: SCORE defeat hidden / UPGRADE defeat P1
  registerRasa083();            // 083/130 - RASA: SCORE +1 point if Sand Village ally
  registerYashamaru085();       // 085/130 - YASHAMARU: SCORE defeat self + another in mission
  registerZabuza087Handlers();  // 087/130 - ZABUZA MOMOCHI: Hide solo enemy / UPGRADE defeat instead
  registerHaku089Handlers();    // 089/130 - HAKU: Discard opp deck POWERUP X / UPGRADE own deck
  registerItachi091Handlers();  // 091/130 - ITACHI UCHIWA: Look at hand / UPGRADE discard from hand
  registerKisame093();          // 093/130 - KISAME HOSHIGAKI: Steal Power tokens from enemy
  registerManda102Handlers();   // 102/130 - MANDA: AMBUSH defeat Summon / [continuous] return
  registerKyodaigumo103();      // 103/130 - KYODAIGUMO: [continuous] hide+return at end of round
}
