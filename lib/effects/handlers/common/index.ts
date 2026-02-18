/**
 * Common card effect handlers index.
 * Registers all 48 common card handlers with the effect registry.
 */

import { registerHandler as registerHiruzen001 } from './hiruzen001';
import { registerHandler as registerTsunade003 } from './tsunade003';
import { registerHandler as registerJiraiya007 } from './jiraiya007';
import { registerHandler as registerNaruto009 } from './naruto009';
import { registerHandler as registerSakura011 } from './sakura011';
import { registerHandler as registerSasuke013 } from './sasuke013';
import { registerHandler as registerKakashi015 } from './kakashi015';
import { registerHandler as registerIno019 } from './ino019';
import { registerHandler as registerShikamaru021 } from './shikamaru021';
import { registerHandler as registerAsuma023 } from './asuma023';
import { registerHandler as registerKiba025 } from './kiba025';
import { registerHandler as registerAkamaru027 } from './akamaru027';
import { registerHandler as registerKurenai034 } from './kurenai034';
import { registerHandler as registerNeji036 } from './neji036';
import { registerHandler as registerTenten040 } from './tenten040';
import { registerHandler as registerGai042 } from './gai042';
import { registerHandler as registerAnko044 } from './anko044';
import { registerHandler as registerEbisu046 } from './ebisu046';
import { registerHandler as registerIruka047 } from './iruka047';
import { registerHandler as registerHayate048 } from './hayate048';
import { registerHandler as registerGenma049 } from './genma049';
import { registerHandler as registerOrochimaru050 } from './orochimaru050';
import { registerHandler as registerKimimaro055 } from './kimimaro055';
import { registerHandler as registerJirobo057 } from './jirobo057';
import { registerHandler as registerKidomaru059 } from './kidomaru059';
import { registerHandler as registerSakon061 } from './sakon061';
import { registerHandler as registerTayuya064 } from './tayuya064';
import { registerHandler as registerDosu068 } from './dosu068';
import { registerHandler as registerZaku070 } from './zaku070';
import { registerHandler as registerKin072 } from './kin072';
import { registerHandler as registerGaara074 } from './gaara074';
import { registerHandler as registerGaara075 } from './gaara075';
import { registerHandler as registerKankuro077 } from './kankuro077';
import { registerHandler as registerTemari079 } from './temari079';
import { registerHandler as registerBaki081 } from './baki081';
import { registerHandler as registerYashamaru084 } from './yashamaru084';
import { registerHandler as registerZabuza086 } from './zabuza086';
import { registerHandler as registerHaku088 } from './haku088';
import { registerHandler as registerItachi090 } from './itachi090';
import { registerHandler as registerKisame092 } from './kisame092';
import { registerHandler as registerGamabunta094 } from './gamabunta094';
import { registerHandler as registerGamahiro095 } from './gamahiro095';
import { registerHandler as registerGamakichi096 } from './gamakichi096';
import { registerHandler as registerGamatatsu097 } from './gamatatsu097';
import { registerHandler as registerKatsuyu098 } from './katsuyu098';
import { registerHandler as registerPakkun099 } from './pakkun099';
import { registerHandler as registerNinjaHounds100 } from './ninjaHounds100';
import { registerHandler as registerTonton101 } from './tonton101';

/**
 * Register all common card effect handlers with the effect registry.
 * Called once during application initialization.
 */
export function registerAllCommonHandlers(): void {
  // Leaf Village characters
  registerHiruzen001();    // 001/130 - HIRUZEN SARUTOBI: POWERUP 2 another Leaf Village
  registerTsunade003();    // 003/130 - TSUNADE: [continuous] On friendly defeat, gain 2 chakra
  registerJiraiya007();    // 007/130 - JIRAYA: Play a Summon paying 1 less
  registerNaruto009();     // 009/130 - NARUTO UZUMAKI: No effects
  registerSakura011();     // 011/130 - SAKURA HARUNO: Draw if Team 7 in mission
  registerSasuke013();     // 013/130 - SASUKE UCHIWA: [continuous] -1 Power per friendly in mission
  registerKakashi015();    // 015/130 - KAKASHI HATAKE: [continuous] Team 7 +1 Power
  registerIno019();        // 019/130 - INO YAMANAKA: POWERUP 1 if Team 10 in mission
  registerShikamaru021();  // 021/130 - SHIKAMARU NARA: Draw if has Edge
  registerAsuma023();      // 023/130 - ASUMA SARUTOBI: Move Team 10 from this mission
  registerKiba025();       // 025/130 - KIBA INUZUKA: [continuous] CHAKRA +1 if Akamaru present
  registerAkamaru027();    // 027/130 - AKAMARU: [continuous] Return to hand if no Kiba
  registerKurenai034();    // 034/130 - YUHI KURENAI: [continuous] Team 8 costs 1 less
  registerNeji036();       // 036/130 - NEJI HYUGA: Remove up to 2 Power tokens from enemy
  registerTenten040();     // 040/130 - TENTEN: [continuous] Play only in winning mission
  registerGai042();        // 042/130 - GAI MAITO: [continuous] Team Guy +1 Power
  registerAnko044();       // 044/130 - ANKO MITARASHI: [continuous] CHAKRA +1 if Leaf ally
  registerEbisu046();      // 046/130 - EBISU: Draw if lesser friendly in mission
  registerIruka047();      // 047/130 - IRUKA: Move a Naruto Uzumaki
  registerHayate048();     // 048/130 - HAYATE GEKKO: [continuous] Hide instead of defeat
  registerGenma049();      // 049/130 - GEMMA SHIRANUI: [continuous] Sacrifice for Leaf ally

  // Sound Village characters
  registerOrochimaru050(); // 050/130 - OROCHIMARU: AMBUSH look/steal hidden enemy
  registerKimimaro055();   // 055/130 - KIMIMARO: AMBUSH discard to hide character
  registerJirobo057();     // 057/130 - JIROBO: POWERUP X (Sound Four missions)
  registerKidomaru059();   // 059/130 - KIDOMARU: Move X friendly (Sound Four missions)
  registerSakon061();      // 061/130 - SAKON: Draw X (Sound Four missions)
  registerTayuya064();     // 064/130 - TAYUYA: [continuous] CHAKRA +X (Sound Four missions)
  registerDosu068();       // 068/130 - DOSU KINUTA: MAIN look hidden / AMBUSH defeat hidden
  registerZaku070();       // 070/130 - ZAKU ABUMI: Opponent gains 1 chakra
  registerKin072();        // 072/130 - KIN TSUCHI: Opponent draws a card

  // Sand Village characters
  registerGaara074();      // 074/130 - GAARA: POWERUP X (hidden allies count)
  registerGaara075();      // 075/130 - GAARA: [continuous] Hide on defeat/move, pay 2 less hidden
  registerKankuro077();    // 077/130 - KANKURO: [continuous] CHAKRA +1 if enemy in mission
  registerTemari079();     // 079/130 - TEMARI: [continuous] +2 Power if has Edge
  registerBaki081();       // 081/130 - BAKI: SCORE draw a card
  registerYashamaru084();  // 084/130 - YASHAMARU: [continuous] +2 Power if Gaara present

  // Independent / Akatsuki characters
  registerZabuza086();     // 086/130 - ZABUZA MOMOCHI: No effects
  registerHaku088();       // 088/130 - HAKU: Draw 1, put 1 on top of deck
  registerItachi090();     // 090/130 - ITACHI UCHIWA: [continuous] Pay 3 less if Sasuke present
  registerKisame092();     // 092/130 - KISAME HOSHIGAKI: AMBUSH steal Power tokens

  // Summon characters
  registerGamabunta094();  // 094/130 - GAMA BUNTA: [continuous] Return at end of round
  registerGamahiro095();   // 095/130 - GAMAHIRO: Draw if friendly, [continuous] return at end
  registerGamakichi096();  // 096/130 - GAMAKICHI: [continuous] Pay 1 less if Naruto, return at end
  registerGamatatsu097();  // 097/130 - GAMATATSU: [continuous] Return at end of round
  registerKatsuyu098();    // 098/130 - KATSUYU: POWERUP 2 if Tsunade, [continuous] return at end

  // Ninja Hound / Pig characters
  registerPakkun099();     // 099/130 - PAKKUN: SCORE move self
  registerNinjaHounds100(); // 100/130 - NINJA HOUNDS: [continuous] Look at hidden on move
  registerTonton101();     // 101/130 - TON TON: [continuous] +1 Power if Tsunade/Shizune
}
