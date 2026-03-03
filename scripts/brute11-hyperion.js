#!/usr/bin/env node
/**
 * brute11-hyperion.js  —  HYPERION IMAGE FINDER
 *
 * 50,000 concurrent workers  (12x brute10)
 * ~44M+ URL combinations      (10x brute10)
 * 8-phase intelligent generation with:
 *   - Confirmed CDN pattern analysis (122 gallery URLs)
 *   - CDN typo engine (Trasformation, Camelia, Careteaker patterns)
 *   - 3-word title combinations
 *   - MV/Mythos V rarity inference
 *   - Structural mutations (hyphen, camelCase, reversed, set-prefix)
 *   - 700+ word universal dictionary
 *   - Per-card smart title lists from similar confirmed cards
 *
 * Loads progress from ALL previous brute scripts (6-10) to skip tested URLs.
 * Generator-based URL production — constant memory regardless of URL count.
 *
 * Usage:  node scripts/brute11-hyperion.js
 * Stop:   Ctrl+C  (progress saved, resumable)
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ─── CONFIGURATION ──────────────────────────────────────────────────────────
const CONCURRENCY    = 50_000;
const TIMEOUT_MS     = 4000;
const MIN_FILE_SIZE  = 5000;
const SAVE_INTERVAL  = 30_000; // ms
const OUT_DIR        = path.join(__dirname, '..', 'newvisual');
const PROGRESS_FILE  = path.join(OUT_DIR, 'brute11_progress.json');
const REPORT_FILE    = path.join(OUT_DIR, 'brute11_report.txt');

const BASES = [
  'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/',
  'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/',
];

const WIDTHS_PRI = ['-1920w', '-1280w', '-960w'];
const WIDTHS_ALL = ['-1920w','-1280w','-960w','-640w','-480w','-1600w','-2048w','-2560w','-3840w','-384w','-256w','-128w','-3200w','-4096w',''];
const EXTS_PRI   = ['.webp'];
const EXTS_ALL   = ['.webp', '.jpg', '.png'];

const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 60_000,
  maxFreeSockets: 10_000,
  timeout: TIMEOUT_MS,
  scheduling: 'fifo',
});

// ─── RARITY PREFIX DATABASES ────────────────────────────────────────────────

const R_ALL = [
  'R','R_ART','RA','ART','Rare','Rare_Art','R-ART','R_Art','r','R_art','Rare_ART',
  'R_HOLO','R_Full','R_Special','Rare_R','RARE',
];
const RA_ALL = [
  'R_ART','RA','ART','Rare_Art','R-ART','R_Art','R_ART_GOLD','r_art','Rare_ART',
  'R_ART_Special','RA_HOLO','RA_Full','ALT_ART','Alt_Art','RARE_ART',
];
const UC_ALL = [
  'UC','Uncommon','U','uc','UC_HOLO','UC_Full','Uncommon_Full',
];
const S_ALL = [
  'Secret_GOLD','SecretV_GOLD','S','Secret','SecretV','Secret_Gold',
  'Secret_SILVER','S_GOLD','Gold','GOLD','SecretV_Gold','Secret_Special',
  'S_Special','SECRET','Secret_V','SV','S_V','Secret_Holo',
];
const MV_ALL = [
  'MV','MV_Special','MV_GOLD','MV_Gold','MV_Art','Mythos_V','MythosV',
  'V','V_Special','V_GOLD','Variant','Art_V','M_V','M_Variant',
  'MV_Variant','MV_Holo','MV_SECRET','MV_Full',
  // Also try plain M prefixes (CDN might not distinguish M vs MV)
  'M','M_Special','M_GOLD','M_Gold','Mythos','M_special','Mythos_Special',
  'M_SPECIAL','M_Holo','M_Full',
];

// ─── CARD DEFINITIONS ───────────────────────────────────────────────────────
// Each card: id, num (primary), nums (all number formats), r (rarity prefixes),
// n (name variants), pri (priority titles), cmb (combo words for 2/3-word gen)

const CARDS = [
  // ── KS-045-UC: ANKO MITARASHI "Shadow Snake Hands" ──
  // CDN confirmed: 44_C_Anko_Undercover (Common version)
  {
    id: 'KS-045-UC', num: '45', nums: ['45','045'],
    r: UC_ALL,
    n: ['Anko','Anko_Mitarashi','AnkoMitarashi','Mitarashi','ANKO','anko'],
    pri: [
      'Shadow_Snake','Snake_Hands','Shadow_Snake_Hands','Striking_Shadow',
      'Striking_Shadow_Snake','Hidden_Snake','Shadow_Serpent','Senei_Jashu',
      'Senei_Ta_Jashu','Snake_Strike','Serpent_Strike','Shadow_Snake_Hand',
      'Viper','Hidden_Shadow','Assassin','Special_Jonin','Forest_Death',
      'Proctor','Examiner','Snake','Serpent','Shadow','Hands','Striking',
      'Undercover','Deadly_Snake','Coiled_Snake','Venomous','Twin_Snake',
      'Multiple_Snake','Snake_Summoning','Snake_Formation','Forbidden',
      'Snake_Authority','Authority_Spell','Snake_Authority_Spell',
      'Dual_Snake','Double_Strike','Fang','Poison','Curse_Mark',
    ],
    cmb: [
      'Shadow','Snake','Hands','Striking','Hidden','Senei','Jashu','Viper',
      'Serpent','Deadly','Assassin','Special','Jonin','Forest','Death',
      'Proctor','Examiner','Curse','Mark','Seal','Summoning','Formation',
      'Multiple','Strike','Fang','Venomous','Poison','Coiled','Twin',
      'Double','Forbidden','Technique','Jutsu','Ninja','Style','Art',
      'Attack','Authority','Spell','Dual','Power','Form','Master','Secret','True',
    ],
  },

  // ── KS-115-R: SHINO ABURAME "Insect Wall Technique" ──
  // CDN confirmed: 32_C_Shino_Parasitic_Insects (Common version)
  {
    id: 'KS-115-R', num: '115', nums: ['115'],
    r: R_ALL,
    n: ['Shino','Shino_Aburame','ShinoAburame','Aburame','SHINO','shino'],
    pri: [
      'Insect_Wall','Wall_Technique','Insect_Wall_Technique','Bug_Wall',
      'Bug_Dome','Insect_Dome','Insect_Sphere','Bug_Sphere','Insect_Barrier',
      'Bug_Barrier','Parasitic_Wall','Parasitic_Destruction','Hidden_Insect',
      'Insect_Jamming','Destruction_Host','Kikaichuu','Kikaichu','Swarm',
      'Insect','Wall','Bug','Colony','Hive','Beetle','Cocoon','Shield',
      'Barrier','Armor','Defense','Protection','Wave','Pillar','Nest',
      'Cloud','Detection','Tracking','Secret_Technique','Insect_Clone',
      'Bug_Clone','Insects','Parasitic_Insects','Wall_of_Insects',
    ],
    cmb: [
      'Insect','Bug','Wall','Technique','Dome','Shield','Barrier','Parasitic',
      'Destruction','Host','Hidden','Swarm','Colony','Hive','Beetle','Cocoon',
      'Kikaichuu','Kikaichu','Formation','Secret','Stoic','Silent','Trap',
      'Cloud','Wave','Nest','Pillar','Armor','Defense','Protection','Clone',
      'Jutsu','Art','Style','Attack','Tracking','Spy','Intel','Sense',
      'Detection','Queen','Jar','Female','Male','Aburame',
    ],
  },

  // ── KS-115-RA: SHINO ABURAME "Insect Wall Technique" (Rare Art) ──
  {
    id: 'KS-115-RA', num: '115', nums: ['115'],
    r: RA_ALL,
    n: ['Shino','Shino_Aburame','ShinoAburame','Aburame','SHINO','shino'],
    pri: [
      'Insect_Wall','Wall_Technique','Insect_Wall_Technique','Bug_Wall',
      'Bug_Dome','Insect_Dome','Insect_Barrier','Bug_Barrier',
      'Parasitic_Wall','Parasitic_Destruction','Kikaichuu','Kikaichu',
      'Insect','Wall','Bug','Swarm','Colony','Hive','Shield','Barrier',
      'Parasitic_Insects','Wall_of_Insects','Insect_Clone','Secret_Technique',
      'Hidden_Insect','Insect_Jamming','Destruction_Host',
    ],
    cmb: [
      'Insect','Bug','Wall','Technique','Dome','Shield','Barrier','Parasitic',
      'Destruction','Host','Hidden','Swarm','Colony','Hive','Beetle','Cocoon',
      'Kikaichuu','Kikaichu','Formation','Secret','Stoic','Silent','Trap',
      'Cloud','Wave','Nest','Pillar','Armor','Defense','Protection','Clone',
      'Jutsu','Art','Style','Attack','Tracking','Spy','Intel','Sense',
      'Detection','Queen','Jar','Female','Male','Aburame',
    ],
  },

  // ── KS-116-RA: NEJI HYUGA "Eight Trigrams Sixty-Four Palms" (Rare Art) ──
  // CDN confirmed: 36_C_Neji_Gentle_fist (Common version)
  {
    id: 'KS-116-RA', num: '116', nums: ['116'],
    r: RA_ALL,
    n: ['Neji','Neji_Hyuga','Neji_Hyuuga','NejiHyuga','Hyuga','Hyuuga','NEJI','neji'],
    pri: [
      'Eight_Trigrams','Sixty_Four_Palms','Eight_Trigrams_Sixty_Four',
      'Hakke','Rokujuyon_Sho','Hakke_Rokujuyon','64_Palms','SixtyFour_Palms',
      'Trigrams','Palm_Strike','Gentle_Fist','Gentle_fist','Byakugan',
      'Eight_Trigrams_Palms','Air_Palm','Rotation','Palm_Rotation',
      'Sixty_Four','Palms','Palm','Eight','Trigram','Kaiten','Tenketsu',
      'Divination','Field','Heavenly_Spin','Twin_Lion_Fists','Lion',
      'Mountain_Crusher','Vacuum_Palm','Prodigy','Genius','Fate',
      'Eight_Trigrams_64','Hakke_64','Jukenho',
    ],
    cmb: [
      'Eight','Trigrams','Sixty','Four','Palms','Palm','Hakke','Rokujuyon',
      'Sho','Gentle','Fist','fist','Byakugan','Air','Rotation','Kaiten',
      'Tenketsu','Divination','Field','Heavenly','Spin','Twin','Lion',
      'Mountain','Crusher','Vacuum','Prodigy','Genius','Fate','Strike',
      'Technique','Jutsu','Style','Art','Secret','Hidden','Ultimate',
      'Supreme','Inner','Gate','Destiny','Branch','Main','House','Hyuga',
      'Wall','Barrier','Shield','Defense',
    ],
  },

  // ── KS-122-R: JIROBO "Arhat Fist" ──
  // CDN confirmed: 57_C_Jiroubou_Earth_Dome (Common - note JIROUBOU spelling!)
  {
    id: 'KS-122-R', num: '122', nums: ['122'],
    r: R_ALL,
    n: ['Jirobo','Jiroubou','Jirobou','Jiroubo','JIROBO','jirobo','Jiroubou_','Jirobou_'],
    pri: [
      'Arhat_Fist','Arhat','Fist','Iron_Fist','Earth_Fist','Power_Fist',
      'Sound_Four','Cursed_Seal','Curse_Mark','Level_2','Transformation',
      'Earth','Dome','Earth_Dome','Barrier','Niroku_Sho','Fist_of_Arhat',
      'Stone','Boulder','Superhuman','Strength','Giant','Absorption',
      'Chakra_Absorption','Cursed_Seal_Level_2','Second_State',
      'Partial_Trasformation','Partial_Transformation',
    ],
    cmb: [
      'Arhat','Fist','Iron','Earth','Power','Sound','Four','Cursed','Seal',
      'Curse','Mark','Level','Transformation','Dome','Barrier','Niroku',
      'Sho','Stone','Boulder','Superhuman','Strength','Giant','Absorption',
      'Chakra','Second','State','Partial','Form','True','Full','Ultimate',
      'Technique','Jutsu','Art','Style','Attack','Defense','Guard','Wall',
      'Smash','Crush','Break','Heavy','Massive','Colossal','Titan','Brute',
    ],
  },

  // ── KS-122-RA: JIROBO "Arhat Fist" (Rare Art) ──
  {
    id: 'KS-122-RA', num: '122', nums: ['122'],
    r: RA_ALL,
    n: ['Jirobo','Jiroubou','Jirobou','Jiroubo','JIROBO','jirobo'],
    pri: [
      'Arhat_Fist','Arhat','Fist','Iron_Fist','Earth_Fist','Power_Fist',
      'Cursed_Seal','Curse_Mark','Level_2','Transformation','Earth_Dome',
      'Niroku_Sho','Fist_of_Arhat','Stone','Boulder','Superhuman',
      'Strength','Chakra_Absorption','Second_State',
    ],
    cmb: [
      'Arhat','Fist','Iron','Earth','Power','Sound','Four','Cursed','Seal',
      'Curse','Mark','Level','Transformation','Dome','Barrier','Niroku',
      'Sho','Stone','Boulder','Superhuman','Strength','Giant','Absorption',
      'Chakra','Second','State','Partial','Form','True','Full','Ultimate',
      'Technique','Jutsu','Art','Style','Attack','Defense','Guard','Wall',
      'Smash','Crush','Break','Heavy','Massive','Colossal','Titan','Brute',
    ],
  },

  // ── KS-124-R: KIDOMARU "Spider Bow: Fierce Rip" ──
  // CDN confirmed: 59_C_Kidomaru_Spider_Web (Common version)
  {
    id: 'KS-124-R', num: '124', nums: ['124'],
    r: R_ALL,
    n: ['Kidomaru','KIDOMARU','kidomaru','Kidomaru_'],
    pri: [
      'Spider_Bow','Fierce_Rip','Spider_Bow_Fierce_Rip','Spider','Bow',
      'Fierce','Rip','Web','Spider_Web','Arrow','Six_Arms','Strand',
      'Kumoshibari','Kumo_Nenkin','Golden_Thread','Sticky_Thread',
      'Spider_Sticky_Gold','Spider_War_Bow','War_Bow','Archery',
      'Cursed_Seal','Curse_Mark','Level_2','Transformation',
      'Sound_Four','Armor','Spider_Armor','Thread','Threads',
      'Partial_Trasformation','Partial_Transformation',
    ],
    cmb: [
      'Spider','Bow','Fierce','Rip','Web','Arrow','Six','Arms','Strand',
      'Kumoshibari','Kumo','Nenkin','Golden','Thread','Sticky','Gold',
      'War','Archery','Cursed','Seal','Curse','Mark','Level','Sound',
      'Four','Armor','Threads','Shot','Shoot','Hunt','Trap','Net',
      'Silk','Spin','Weave','String','Launch','Barrage','Rain','Storm',
      'Technique','Jutsu','Art','Style','Attack','Form',
    ],
  },

  // ── KS-124-RA: KIDOMARU "Spider Bow: Fierce Rip" (Rare Art) ──
  {
    id: 'KS-124-RA', num: '124', nums: ['124'],
    r: RA_ALL,
    n: ['Kidomaru','KIDOMARU','kidomaru'],
    pri: [
      'Spider_Bow','Fierce_Rip','Spider_Bow_Fierce_Rip','Spider','Bow',
      'Arrow','Web','Spider_Web','Six_Arms','Kumoshibari','Kumo_Nenkin',
      'Spider_War_Bow','War_Bow','Cursed_Seal','Transformation',
    ],
    cmb: [
      'Spider','Bow','Fierce','Rip','Web','Arrow','Six','Arms','Strand',
      'Kumoshibari','Kumo','Nenkin','Golden','Thread','Sticky','Gold',
      'War','Archery','Cursed','Seal','Curse','Mark','Level','Sound',
      'Four','Armor','Threads','Shot','Shoot','Hunt','Trap','Net',
      'Silk','Spin','Weave','String','Launch','Barrage','Rain','Storm',
      'Technique','Jutsu','Art','Style','Attack','Form',
    ],
  },

  // ── KS-126-R: OROCHIMARU "Get out of my way." ──
  // CDN confirmed: 50_C_Orochimaru_Undercover (Common version)
  // NOTE: Title is a quote, not a technique. CDN likely uses a descriptor.
  {
    id: 'KS-126-R', num: '126', nums: ['126'],
    r: R_ALL,
    n: ['Orochimaru','OROCHIMARU','orochimaru','Orochimaru_'],
    pri: [
      'Defiance','Power','True_Power','True_Form','Intimidation',
      'Overwhelming','Snake_Lord','Sannin','Immortality','Rebellion',
      'Ambition','Reincarnation','Living_Corpse','Eight_Headed',
      'Yamata','Snake_Summon','Kusanagi','Sword','Blade','Snake',
      'Giant_Snake','White_Snake','Triple_Rashomon','Rashomon',
      'Get_Out','My_Way','Fury','Wrath','Rage','Summoning',
      'Manda','Edo_Tensei','Reanimation','Substitution','Body',
      'Wind_Style','Orochi','Formation','Forbidden','Jutsu',
      'Curse','Curse_Mark','Heaven_Seal','Earth_Seal','Terror',
      'Fear','Menace','Threat','Danger','Villain','Master',
    ],
    cmb: [
      'Defiance','Power','True','Form','Intimidation','Overwhelming',
      'Snake','Lord','Sannin','Immortality','Rebellion','Ambition',
      'Reincarnation','Living','Corpse','Eight','Headed','Yamata',
      'Summon','Kusanagi','Sword','Blade','Giant','White','Triple',
      'Rashomon','Fury','Wrath','Rage','Summoning','Manda','Edo',
      'Tensei','Reanimation','Substitution','Body','Orochi','Forbidden',
      'Curse','Mark','Heaven','Earth','Seal','Terror','Fear','Menace',
    ],
  },

  // ── KS-127-R: SAKON "Stone Fist" ──
  // CDN confirmed: 61_C_Sakon_Molecular_Possession (Common version)
  {
    id: 'KS-127-R', num: '127', nums: ['127'],
    r: R_ALL,
    n: ['Sakon','SAKON','sakon','Sakon_Ukon','SakonUkon','Ukon'],
    pri: [
      'Stone_Fist','Stone','Fist','Rock_Fist','Iron_Fist','Power_Fist',
      'Twin','Twins','Ukon','Rashomon','Gate','Multiple_Fist','Cursed_Seal',
      'Curse_Mark','Level_2','Transformation','Sound_Four','Molecular',
      'Possession','Molecular_Possession','Parasite','Fusion','Merge',
      'Split','Demon','Double','Pair','Brothers',
      'Partial_Trasformation','Partial_Transformation',
    ],
    cmb: [
      'Stone','Fist','Rock','Iron','Power','Twin','Twins','Ukon','Rashomon',
      'Gate','Multiple','Cursed','Seal','Curse','Mark','Level','Sound',
      'Four','Molecular','Possession','Parasite','Fusion','Merge','Split',
      'Demon','Double','Pair','Brothers','Transformation','Second','State',
      'Form','True','Full','Ultimate','Technique','Jutsu','Art','Style',
      'Attack','Defense','Guard','Smash','Crush','Break','Heavy','Brute',
    ],
  },

  // ── KS-127-RA: SAKON "Stone Fist" (Rare Art) ──
  {
    id: 'KS-127-RA', num: '127', nums: ['127'],
    r: RA_ALL,
    n: ['Sakon','SAKON','sakon','Sakon_Ukon','Ukon'],
    pri: [
      'Stone_Fist','Stone','Fist','Rock_Fist','Iron_Fist','Twin','Rashomon',
      'Cursed_Seal','Transformation','Sound_Four','Molecular_Possession',
    ],
    cmb: [
      'Stone','Fist','Rock','Iron','Power','Twin','Twins','Ukon','Rashomon',
      'Gate','Multiple','Cursed','Seal','Curse','Mark','Level','Sound',
      'Four','Molecular','Possession','Parasite','Fusion','Merge','Split',
      'Demon','Double','Pair','Brothers','Transformation','Second','State',
      'Form','True','Full','Ultimate','Technique','Jutsu','Art','Style',
      'Attack','Defense','Guard','Smash','Crush','Break','Heavy','Brute',
    ],
  },

  // ── KS-129-R: NINE-TAILS / KYUBI "Demon Fox Cloak" ──
  {
    id: 'KS-129-R', num: '129', nums: ['129'],
    r: R_ALL,
    n: [
      'Kyubi','Kyuubi','Kurama','Nine_Tails','NineTails','Nine-Tails',
      'Naruto','Naruto_Kyubi','Naruto_Uzumaki','Fox','Demon_Fox',
      'KYUBI','kyubi','Naruto_Fox','Bijuu','Tailed_Beast',
    ],
    pri: [
      'Demon_Fox','Fox_Cloak','Demon_Fox_Cloak','Cloak','Nine_Tails',
      'Chakra_Cloak','Red_Chakra','Jinchuriki','Beast_Form','Tailed_Beast',
      'Bijuu','One_Tail_Cloak','Tail','Tails','Kyubi','Kurama','Fox',
      'Demon','Rampage','Berserk','Unleashed','Rage','Fury','Power',
      'Transformation','Chakra','Beast','Monster','Release','Seal',
      'Four_Tails','Tail_Form','Version','Vermillion','Rasengan',
      'Giant','Menacing','Overwhelming','Nine','Tailed','Awakening',
    ],
    cmb: [
      'Demon','Fox','Cloak','Nine','Tails','Tail','Chakra','Red','Beast',
      'Form','Tailed','Bijuu','Jinchuriki','Kurama','Kyubi','Rampage',
      'Berserk','Unleashed','Rage','Fury','Power','Transformation',
      'Monster','Release','Seal','Four','Version','Vermillion','Rasengan',
      'Giant','Menacing','Overwhelming','Awakening','One','Shroud',
      'Aura','Energy','Spirit','Dark','Wild','Feral','Primal','Ancient',
      'Naruto','Mode',
    ],
  },

  // ── KS-129-RA: NINE-TAILS / KYUBI "Demon Fox Cloak" (Rare Art) ──
  {
    id: 'KS-129-RA', num: '129', nums: ['129'],
    r: RA_ALL,
    n: [
      'Kyubi','Kyuubi','Kurama','Nine_Tails','NineTails','Nine-Tails',
      'Naruto','Fox','Demon_Fox','KYUBI','kyubi','Bijuu',
    ],
    pri: [
      'Demon_Fox','Fox_Cloak','Demon_Fox_Cloak','Cloak','Nine_Tails',
      'Chakra_Cloak','Red_Chakra','Jinchuriki','Beast_Form','Tailed_Beast',
      'Kyubi','Kurama','Fox','Demon','Rampage','Unleashed','Rage','Power',
      'Transformation','Chakra','Beast','Seal','Awakening',
    ],
    cmb: [
      'Demon','Fox','Cloak','Nine','Tails','Tail','Chakra','Red','Beast',
      'Form','Tailed','Bijuu','Jinchuriki','Kurama','Kyubi','Rampage',
      'Berserk','Unleashed','Rage','Fury','Power','Transformation',
      'Monster','Release','Seal','Four','Version','Vermillion','Rasengan',
      'Giant','Menacing','Overwhelming','Awakening','One','Shroud',
      'Aura','Energy','Spirit','Dark','Wild','Feral','Primal','Ancient',
      'Naruto','Mode',
    ],
  },

  // ── KS-130-R: ONE-TAIL / SHUKAKU "I hope you're ready to die!" ──
  // NOTE: Title is a quote. CDN likely uses descriptor. Could be under Gaara.
  {
    id: 'KS-130-R', num: '130', nums: ['130'],
    r: R_ALL,
    n: [
      'Shukaku','One_Tail','OneTail','One-Tail','Gaara','Ichibi',
      'SHUKAKU','shukaku','Gaara_Shukaku','Tanuki','Sand_Spirit',
    ],
    pri: [
      'Shukaku','One_Tail','Full_Form','Sand_Spirit','Demon','Beast',
      'Transformation','Tanuki','Raccoon','Ultimate','Awaken','Unleashed',
      'Sand','Sand_Demon','Desert','Gaara','Ichibi','Jinchuriki',
      'Tailed_Beast','Bijuu','Monster','Giant','Possession','Rampage',
      'Berserk','Fury','Sand_Burial','Sand_Coffin','Ready_to_Die',
      'Death','Final','Form','True','Power','Release','Awakening',
      'Full_Transformation','Partial_Trasformation','Partial_Transformation',
      'Hope','Die','Ready',
    ],
    cmb: [
      'Shukaku','One','Tail','Full','Form','Sand','Spirit','Demon','Beast',
      'Transformation','Tanuki','Raccoon','Ultimate','Awaken','Unleashed',
      'Desert','Gaara','Ichibi','Jinchuriki','Tailed','Bijuu','Monster',
      'Giant','Possession','Rampage','Berserk','Fury','Burial','Coffin',
      'Death','Final','True','Power','Release','Awakening','Hope','Die',
      'Ready','Partial','Shield','Armor','Wave','Storm','Tsunami','Crush',
      'Ancient','Primal',
    ],
  },

  // ── KS-134-S: NINE-TAILED FOX "The Beast Awakens" ──
  // Rarity pattern: 131=SecretV, 132=Secret, 133=SecretV, 134=? (likely Secret_GOLD)
  {
    id: 'KS-134-S', num: '134', nums: ['134'],
    r: S_ALL,
    n: [
      'Naruto','Kyubi','Kurama','Nine_Tails','NineTails','Nine-Tails',
      'Fox','Demon_Fox','Naruto_Kyubi','Naruto_Uzumaki','NARUTO','naruto',
      'Naruto_Fox','Beast','Bijuu','Tailed_Beast',
    ],
    pri: [
      'Beast_Awakens','Beast','Awakens','Awakening','The_Beast_Awakens',
      'Unleashed','Berserk','Rampage','Nine_Tails','Kyubi','Kurama',
      'Fox','Demon_Fox','Tailed_Beast','Bijuu','Jinchuriki','Cloak',
      'Chakra_Cloak','Four_Tails','Tail_Form','Transformation','Rage',
      'Fury','Power','Release','Seal','Monster','Demon','Beast_Mode',
      'Wild','Feral','Primal','Ancient','Dark','Awakened','Beastly',
      'Version_2','V2','Vermillion','Rasengan','Giant_Rasengan',
    ],
    cmb: [
      'Beast','Awakens','Awakening','Unleashed','Berserk','Rampage',
      'Nine','Tails','Tail','Kyubi','Kurama','Fox','Demon','Tailed',
      'Bijuu','Jinchuriki','Cloak','Chakra','Four','Form','Transformation',
      'Rage','Fury','Power','Release','Seal','Monster','Mode','Wild',
      'Feral','Primal','Ancient','Dark','Awakened','Version','Vermillion',
      'Rasengan','Giant','Red','Shroud','Aura','Energy','Spirit',
      'Naruto','Ultimate',
    ],
  },

  // ── KS-135-MV: SAKURA HARUNO "He's looking... right at me!" (Mythos V) ──
  // CDN confirmed: 135_Secret_GOLD_Sakura_Recovery_Team (Secret version)
  {
    id: 'KS-135-MV', num: '135', nums: ['135'],
    r: MV_ALL,
    n: ['Sakura','Sakura_Haruno','SakuraHaruno','Haruno','SAKURA','sakura'],
    pri: [
      'Looking','Right_at_Me','Crush','Love','Heart','Sakura','Blushing',
      'Recovery_Team','Medical','Healing','Inner_Sakura','Determination',
      'Kunoichi','Admiration','Shy','Emotion','Feeling','Watching',
      'Staring','Glance','Gaze','Eyes','Look','Romance','Hope',
      'He_s_Looking','Looking_Right','At_Me','Cherry_Blossom','Blossom',
      'Spring','Pink','Flower','Petal','Beauty','Grace','Strength',
      'Punch','Fist','Power','Courage','Dream','Wish',
    ],
    cmb: [
      'Looking','Right','Me','Crush','Love','Heart','Blushing','Recovery',
      'Team','Medical','Healing','Inner','Determination','Kunoichi',
      'Admiration','Shy','Emotion','Feeling','Watching','Staring',
      'Glance','Gaze','Eyes','Look','Romance','Hope','Cherry','Blossom',
      'Spring','Pink','Flower','Petal','Beauty','Grace','Strength',
      'Punch','Fist','Power','Courage','Dream','Wish','Girl','Young',
      'Sasuke',
    ],
  },

  // ── KS-136-MV: SASUKE UCHIHA "You're annoying." (Mythos V) ──
  // CDN confirmed: 136_SecretV_GOLD_Sasuke_Heaven_Curse_Mark (Secret version)
  {
    id: 'KS-136-MV', num: '136', nums: ['136'],
    r: MV_ALL,
    n: ['Sasuke','Sasuke_Uchiha','SasukeUchiha','Uchiha','SASUKE','sasuke'],
    pri: [
      'Annoying','Annoyed','Bothered','Cool','Indifferent','Aloof',
      'Heaven_Curse_Mark','Curse_Mark','Sharingan','Chidori','Avenger',
      'Loner','Prodigy','Genius','Uchiha','Fire','Fireball',
      'You_re_Annoying','Annoying_You','Cold','Distant','Lone_Wolf',
      'Attitude','Disdain','Contempt','Bored','Unimpressed','Rival',
      'Dark','Shadow','Night','Blade','Sword','Lightning','Thunder',
      'Pride','Honor','Revenge','Vengeance','Power','Ambition',
    ],
    cmb: [
      'Annoying','Annoyed','Bothered','Cool','Indifferent','Aloof',
      'Heaven','Curse','Mark','Sharingan','Chidori','Avenger','Loner',
      'Prodigy','Genius','Uchiha','Fire','Fireball','Cold','Distant',
      'Lone','Wolf','Attitude','Disdain','Contempt','Bored','Rival',
      'Dark','Shadow','Night','Blade','Sword','Lightning','Thunder',
      'Pride','Honor','Revenge','Vengeance','Power','Ambition','Calm',
      'Silent','Elite','Young',
    ],
  },

  // ── KS-149-MV: KIBA INUZUKA "Fang Over Fang" (Mythos V) ──
  // CDN confirmed: 25_C_Kiba_All_Four (Common version)
  {
    id: 'KS-149-MV', num: '149', nums: ['149'],
    r: MV_ALL,
    n: ['Kiba','Kiba_Inuzuka','KibaInuzuka','Inuzuka','KIBA','kiba'],
    pri: [
      'Fang_Over_Fang','Fang','Gatsuuga','Gatsuga','Twin_Fang',
      'Double_Fang','Beast','Wolf','Hound','Man_Beast','Clone',
      'Man_Beast_Clone','Two-Headed_Wolf','Two_Headed_Wolf','Akamaru',
      'All_Four','Wild','Feral','Piercing_Fang','Tsuuga','Tsuga',
      'Spinning','Rotation','Drill','Dual','Pair','Fangs','Claw',
      'Claws','Beast_Mimicry','Tunneling','Dynamic_Marking',
      'Inuzuka','Dog','Canine','Pack','Hunt','Hunting','Tracker',
    ],
    cmb: [
      'Fang','Over','Gatsuuga','Gatsuga','Twin','Double','Beast','Wolf',
      'Hound','Man','Clone','Two','Headed','Akamaru','All','Four','Wild',
      'Feral','Piercing','Tsuuga','Tsuga','Spinning','Rotation','Drill',
      'Dual','Pair','Fangs','Claw','Claws','Mimicry','Tunneling',
      'Dynamic','Marking','Inuzuka','Dog','Canine','Pack','Hunt',
      'Hunting','Tracker','Nose','Scent','Smell','Speed','Charge',
    ],
  },

  // ── KS-150-MV: SHIKAMARU NARA "Shadow Strangle Jutsu" (Mythos V) ──
  // CDN confirmed: 21_C_Shikamaru_Shadow_Possession (Common version)
  {
    id: 'KS-150-MV', num: '150', nums: ['150'],
    r: MV_ALL,
    n: ['Shikamaru','Shikamaru_Nara','ShikamaruNara','Nara','SHIKAMARU','shikamaru'],
    pri: [
      'Shadow_Strangle','Strangle','Kage_Kubi','Shadow_Neck','Kage_Kubi_Shibari',
      'Shadow_Possession','Possession','Shadow','Kage_Mane','Strategy',
      'Strategist','Genius','Lazy','Shadow_Bind','Shadow_Jutsu',
      'Shikamaru','Nara','Choke','Strangling','Neck_Bind','Shadow_Choke',
      'Shadow_Strangulation','Shadow_Control','Control','Shadow_Master',
      'Trap','Capture','Bind','Immobilize','Freeze','Hold',
    ],
    cmb: [
      'Shadow','Strangle','Kage','Kubi','Neck','Shibari','Possession',
      'Mane','Strategy','Strategist','Genius','Lazy','Bind','Jutsu',
      'Nara','Choke','Strangling','Control','Master','Trap','Capture',
      'Immobilize','Freeze','Hold','Think','Plan','Mind','Dark',
      'Night','Strangulation','Grip','Squeeze','Lock','Pin','Snare',
      'Web','Thread','Wire','Technique','Art','Style','Form','Attack',
      'Defense','Guard','Counter','Tactic',
    ],
  },

  // ── KS-151-MV: ROCK LEE "Loopy Fist" (Mythos V) ──
  // CDN confirmed: 117_R_ART_RockLee_Loopy_Fist (Rare Art version - same title!)
  // VERY likely: 151_MV_RockLee_Loopy_Fist or 151_MV_Special_RockLee_Loopy_Fist
  {
    id: 'KS-151-MV', num: '151', nums: ['151'],
    r: MV_ALL,
    n: ['RockLee','Rock_Lee','Lee','ROCKLEE','rocklee','Rock_lee'],
    pri: [
      'Loopy_Fist','Loopy','Suiken','Drunken_Fist','Drunken','Fist',
      'Primary_Lotus','Lotus','Ferocious_Fist','Ferocious','Training',
      'Gate','Gates','Inner_Gates','Eight_Gates','Youth','Taijutsu',
      'Green_Beast','Hidden_Lotus','Reverse_Lotus','Dynamic_Entry',
      'Leaf_Hurricane','Whirlwind','Kick','Punch','Speed','Power',
    ],
    cmb: [
      'Loopy','Fist','Suiken','Drunken','Primary','Lotus','Ferocious',
      'Training','Gate','Gates','Inner','Eight','Youth','Taijutsu',
      'Green','Beast','Hidden','Reverse','Dynamic','Entry','Leaf',
      'Hurricane','Whirlwind','Kick','Punch','Speed','Power','Strong',
      'Fast','Lee','Rock','Might','Guy','Gai','Spirit','Effort',
      'Hard','Work','Determination','Will','Fire','Flame','Burning',
      'Passion','Iron','Steel','Drunk','Sake','Bottle',
    ],
  },

  // ── KS-152-MV: ITACHI UCHIHA "Amaterasu" (Mythos V) ──
  // CDN confirmed: 143_M_Special_Itachi_Hunting (Mythos version - different title)
  {
    id: 'KS-152-MV', num: '152', nums: ['152'],
    r: MV_ALL,
    n: ['Itachi','Itachi_Uchiha','ItachiUchiha','Uchiha_Itachi','ITACHI','itachi'],
    pri: [
      'Amaterasu','Amateratsu','Black_Flames','Black_Fire','Flames',
      'Hunting','Mangekyo','Mangekyo_Sharingan','Sharingan','Tsukuyomi',
      'Susanoo','Genjutsu','Akatsuki','Rogue_Ninja','Crow','Crows',
      'Uchiha','Massacre','Illusion','Mirror','Itachi','Eyes','Eye',
      'Blaze','Inferno','Eternal','Dark','Shadow','Night','Moon',
      'Totsuka','Blade','Yata','Shield','Izanami','Izanagi',
    ],
    cmb: [
      'Amaterasu','Amateratsu','Black','Flames','Fire','Hunting','Mangekyo',
      'Sharingan','Tsukuyomi','Susanoo','Genjutsu','Akatsuki','Rogue',
      'Ninja','Crow','Crows','Uchiha','Massacre','Illusion','Mirror',
      'Eyes','Eye','Blaze','Inferno','Eternal','Dark','Shadow','Night',
      'Moon','Totsuka','Blade','Yata','Shield','Izanami','Izanagi',
      'Technique','Jutsu','Art','Style','Power','True','Secret','God',
      'Divine','Heaven','Hell','Curse',
    ],
  },

  // ── KS-153-MV: GAARA "Sand Burial" (Mythos V) ──
  // CDN confirmed: 74_C_Gaara_Jinchuriki, 75_C_Gaara_Sand_Shield,
  //                120_R_Gaara_Sand_Coffin (R version)
  {
    id: 'KS-153-MV', num: '153', nums: ['153'],
    r: MV_ALL,
    n: ['Gaara','GAARA','gaara','Gaara_','Sabaku'],
    pri: [
      'Sand_Burial','Sabaku_Soso','Sabaku','Burial','Sand','Desert',
      'Sand_Coffin','Coffin','Sand_Shield','Shield','Jinchuriki',
      'Sand_Tsunami','Tsunami','Sand_Waterfall','Waterfall','Giant',
      'Sand_Prison','Prison','Sand_Avalanche','Avalanche','Kazekage',
      'Shukaku','One_Tail','Desert_Funeral','Funeral','Crushing',
      'Sand_Tomb','Tomb','Sand_Wave','Wave','Sand_Storm','Storm',
      'Sand_Armor','Armor','Third_Eye','Eye','Absolute_Defense',
    ],
    cmb: [
      'Sand','Burial','Sabaku','Soso','Desert','Coffin','Shield',
      'Jinchuriki','Tsunami','Waterfall','Giant','Prison','Avalanche',
      'Kazekage','Shukaku','One','Tail','Funeral','Crushing','Tomb',
      'Wave','Storm','Armor','Third','Eye','Absolute','Defense',
      'Gourd','Dust','Earth','Grave','Death','Crush','Bury','Deep',
      'Ground','Below','Beneath','Under','Pressure','Weight','Heavy',
      'Requiem','Sarcophagus','Entomb','Layer','Imperial','Grains',
      'Form','True','Ultimate',
    ],
  },
];

// ─── UNIVERSAL DICTIONARY ───────────────────────────────────────────────────
// 700+ words extracted from confirmed CDN URLs + Naruto vocabulary + descriptors
// Used in Phase 4 (single-word enumeration) for all cards

const UNIVERSAL_DICT = [
  // ── Confirmed CDN title words (HIGHEST priority) ──
  'Professor','Hokage','Master','Reserve','Seal','Assistant','Needle','Shot',
  'Toad','Sage','Dark','Swamp','Genin','Substitution','Chakra','Prowess',
  'Last','Sharingan','Teacher','Expansion','Human','Boulder','Mind','Transfer',
  'Shadow','Possession','Trench','Knives','All','Four','Hound','Man','Beast',
  'Clone','Two','Headed','Wolf','Gentle','fist','Fist','Byakugan','Parasitic',
  'Insects','Tree','Bind','Palm','Rotation','Training','Primary','Lotus',
  'Weapon','Specialist','Ferocious','Proctor','Trainer','Instructor','Shinobi',
  'Elite','Guard','Undercover','Infiltrator','Yin','Healing','Nirvana','Temple',
  'Camelia','Dance','Shikotsumyaku','Bearer','Earth','Dome','Spider','Web',
  'Black','Molecular','Demon','Flute','Summoning','Superhuman','Echo','Speaker',
  'Slicing','Kunoichi','Bell','Sound','Jinchuriki','Sand','Shield','Partial',
  'Trasformation','Transformation','Threads','Puppet','Jutsu','Sandstorm',
  'Council','Agent','Careteaker','Kubikiribocho','Orphan','Crystal','Ice',
  'Mirrors','Akatsuki','Rogue','Ninja','Chief','Armed','Eldest','Son',
  'Youngest','Giant','Slug','Pig','Medical','Strangle','Chili','Pepper',
  'Loopy','Iron','Maiden','Coffin','Wind','Scythe','Control','Hunting',
  'absorb','Rasengan','Recovery','Team','Heaven','Curse','Mark','Lightning',
  'Blade','Transference','Ritual','Original','Legendary','Naruto',
  // ── Extended Naruto technique vocabulary ──
  'Snake','Fang','Insect','Bug','Wall','Bow','Arrow','Spider','Stone',
  'Rock','Fire','Water','Thunder','Lightning','Ice','Lava','Magnet',
  'Boil','Steam','Dust','Particle','Swift','Explosion','Scorch','Wood',
  'Crystal','Steel','Storm','Blaze','Vapor','Ash','Smoke','Mist','Fog',
  'Rain','Cloud','Wave','Tornado','Hurricane','Cyclone','Vortex','Whirlpool',
  'Flame','Inferno','Ember','Spark','Bolt','Surge','Shock','Burst','Blast',
  'Beam','Ray','Flash','Glow','Shine','Light','Darkness','Shadow','Night',
  'Moon','Sun','Star','Sky','Heaven','Hell','Earth','Ground','Mountain',
  'River','Ocean','Sea','Lake','Pond','Spring','Autumn','Winter','Summer',
  // ── Body/combat terms ──
  'Fist','Palm','Finger','Kick','Punch','Strike','Slash','Cut','Pierce',
  'Stab','Thrust','Swing','Spin','Twist','Flip','Jump','Dash','Rush',
  'Charge','Tackle','Grab','Throw','Slam','Smash','Crush','Break','Shatter',
  'Destroy','Annihilate','Demolish','Devastate','Obliterate','Pulverize',
  'Barrage','Combo','Chain','Sequence','Series','Flurry','Volley','Salvo',
  // ── Weapon terms ──
  'Sword','Blade','Knife','Kunai','Shuriken','Senbon','Spear','Lance',
  'Axe','Hammer','Mace','Staff','Bow','Arrow','Shield','Armor','Helmet',
  'Gauntlet','Whip','Chain','Wire','Thread','String','Needle','Scalpel',
  // ── Descriptors ──
  'Power','Force','Strength','Might','Energy','Spirit','Aura','Chakra',
  'Ki','Chi','Life','Soul','Heart','Mind','Will','Resolve','Determination',
  'Courage','Valor','Honor','Pride','Glory','Victory','Triumph','Conquest',
  'Ultimate','Supreme','Maximum','Extreme','Absolute','Perfect','Complete',
  'Final','Last','First','True','Real','Pure','Full','Total','Mega','Super',
  'Ultra','Hyper','Grand','Great','Greater','Greatest','Mighty','Powerful',
  'Strong','Fierce','Ferocious','Savage','Wild','Feral','Primal','Ancient',
  'Eternal','Immortal','Divine','Sacred','Holy','Cursed','Forbidden','Secret',
  'Hidden','Sealed','Released','Unleashed','Awakened','Evolved','Ascended',
  // ── Japanese technique names ──
  'Senei','Jashu','Kikaichuu','Kikaichu','Hakke','Rokujuyon','Tarenken',
  'Kumoshibari','Kuchiyose','Sabaku','Soso','Kyuu','Taiso','Suiken','Zuiken',
  'Katon','Suiton','Doton','Futon','Raiton','Hyoton','Mokuton','Shakuton',
  'Jiton','Futton','Jinton','Bakuton','Shoton','Koton','Ranton','Enton',
  'Rasen','Shuriken','Chidori','Raikiri','Amaterasu','Tsukuyomi','Susanoo',
  'Izanagi','Izanami','Kotoamatsukami','Kamui','Totsuka','Yata','Yasaka',
  'Magatama','Tengai','Shinsei','Chibaku','Tensei','Rinne','Gedo','Mazo',
  'Gedou','Mazou','Bijuu','Dama','Rasenshuriken','Odama','Cho','Oodama',
  'Fuuton','Kaze','Kagebunshin','Bunshin','Henge','Kawarimi','Shunshin',
  'Hiraishin','Edo','Tensei','Reanimation','Impure','World',
  // ── Character roles/titles ──
  'Hokage','Kazekage','Mizukage','Raikage','Tsuchikage','Kage','Sannin',
  'Genin','Chunin','Jonin','Anbu','Root','Captain','Commander','Leader',
  'Chief','Lord','Lady','Princess','Prince','King','Queen','Hero','Villain',
  'Avenger','Prodigy','Genius','Rookie','Veteran','Sensei','Student',
  'Disciple','Apprentice','Master','Sage','Hermit','Monk','Priest',
  // ── Naruto-specific concepts ──
  'Tailed','Beast','Fox','Dog','Cat','Slug','Toad','Snake','Hawk','Crow',
  'Monkey','Turtle','Octopus','Ox','Horse','Tanuki','Raccoon','Shukaku',
  'Kurama','Matatabi','Isobu','Kokuo','Saiken','Chomei','Gyuki','Son',
  'Goku','Seal','Gate','Gates','Opening','Closing','Release','Limit',
  'Barrier','Formation','Array','Circle','Ritual','Technique','Art','Style',
  'Mode','Form','State','Phase','Level','Stage','Rank','Class','Grade',
  'Type','Kind','Version','Variant','Model','Edition','Special','Rare',
  'Secret','Legendary','Mythical','Mystic','Arcane','Occult','Esoteric',
  // ── French vocabulary (CDN might use French) ──
  'Serpent','Ombre','Mur','Insecte','Poing','Pierre','Araignee','Arc',
  'Renard','Manteau','Sable','Cercueil','Tombeau','Crocs','Ivresse',
  'Flamme','Vent','Foudre','Eau','Terre','Feu','Glace','Bois','Acier',
  'Lumiere','Tenebres','Nuit','Lune','Soleil','Etoile','Ciel','Enfer',
  'Paradis','Montagne','Riviere','Ocean','Mer','Lac','Source','Epee',
  'Lame','Bouclier','Armure','Casque','Fouet','Chaine','Fil','Aiguille',
  'Puissance','Force','Energie','Esprit','Ame','Coeur','Volonte',
  'Courage','Honneur','Fierte','Gloire','Victoire','Triomphe','Ultime',
  'Supreme','Absolu','Parfait','Final','Vrai','Pur','Total','Grand',
  'Sacre','Maudit','Interdit','Scelle','Libere','Eveille','Divin',
  // ── Common CDN typo patterns (based on confirmed typos) ──
  'Trasformation','Camelia','Careteaker','Camellia','Caretaker',
  'Techniqe','Tecnique','Technik','Technic','Technnique',
  'Posession','Possesion','Absorbtion','Absorb','Aborb',
  'Sheild','Sheld','Barel','Barier','Barrer',
  'Buriel','Bureal','Cofin','Coffn',
  // ── Additional combat/descriptor words ──
  'Attack','Defense','Guard','Counter','Dodge','Evade','Block','Parry',
  'Riposte','Assault','Raid','Siege','Battle','War','Fight','Combat',
  'Duel','Match','Clash','Conflict','Struggle','Showdown','Standoff',
  'Ambush','Trap','Snare','Decoy','Feint','Bluff','Trick','Illusion',
  'Genjutsu','Ninjutsu','Taijutsu','Bukijutsu','Kenjutsu','Fuinjutsu',
  'Senjutsu','Sage_Mode','Curse_Mark','Cursed_Seal','Reaper_Death',
  'Dead','Alive','Living','Undead','Ghost','Spirit','Phantom','Specter',
  'Wraith','Shade','Revenant','Apparition','Vision','Dream','Nightmare',
  'Prophecy','Fate','Destiny','Doom','Judgment','Wrath','Vengeance',
  'Retribution','Karma','Justice','Mercy','Forgiveness','Redemption',
  'Sacrifice','Offering','Gift','Blessing','Miracle','Wonder','Marvel',
];

// ─── CDN TYPO ENGINE ────────────────────────────────────────────────────────
// Generate common spelling errors based on observed CDN patterns:
//   Trasformation (dropped 'n'), Camelia (dropped 'l'), Careteaker (extra 'e')

function generateTypos(word) {
  const typos = new Set();
  // 1. Drop each letter
  for (let i = 0; i < word.length; i++) {
    typos.add(word.slice(0, i) + word.slice(i + 1));
  }
  // 2. Double each letter
  for (let i = 0; i < word.length; i++) {
    typos.add(word.slice(0, i) + word[i] + word.slice(i));
  }
  // 3. Swap adjacent letters
  for (let i = 0; i < word.length - 1; i++) {
    typos.add(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2));
  }
  // 4. Common substitutions
  const subs = { 's': 'z', 'z': 's', 'c': 'k', 'k': 'c', 'ph': 'f', 'f': 'ph',
                 'ou': 'u', 'u': 'ou', 'ei': 'ie', 'ie': 'ei', 'ae': 'e', 'oe': 'e' };
  for (const [from, to] of Object.entries(subs)) {
    if (word.includes(from)) typos.add(word.replace(from, to));
  }
  typos.delete(word); // Remove original
  return [...typos].filter(t => t.length >= 3);
}

function generateTitleTypos(title) {
  // Generate typos for multi-word titles
  const parts = title.split('_');
  const results = new Set();
  for (let i = 0; i < parts.length; i++) {
    const typos = generateTypos(parts[i]);
    for (const typo of typos) {
      const newParts = [...parts];
      newParts[i] = typo;
      results.add(newParts.join('_'));
    }
  }
  return [...results];
}

// ─── PROGRESS & DEDUPLICATION ───────────────────────────────────────────────

function loadAllProgress() {
  const skipSet = new Set();
  const progressFiles = [
    path.join(OUT_DIR, 'brute6_progress.json'),
    path.join(OUT_DIR, 'brute7_progress.json'),
    path.join(OUT_DIR, 'brute8_progress.json'),
    path.join(OUT_DIR, 'brute9_progress.json'),
    path.join(OUT_DIR, 'brute10_progress.json'),
    PROGRESS_FILE,
  ];
  let loaded = 0;
  for (const f of progressFiles) {
    try {
      if (!fs.existsSync(f)) continue;
      const data = JSON.parse(fs.readFileSync(f, 'utf8'));
      const urls = data.testedUrls || data.tested || [];
      for (const u of urls) skipSet.add(u);
      loaded += urls.length;
    } catch { /* skip corrupted */ }
  }
  console.log(`  Loaded ${loaded.toLocaleString()} previously tested URLs from ${progressFiles.length} files`);
  return skipSet;
}

// ─── URL GENERATORS (8 PHASES) ──────────────────────────────────────────────
// Each phase is a generator function yielding {url, cardId} objects.
// Generator-based = constant memory regardless of total URL count.

// Phase 1: HIGH PRIORITY — Most likely patterns based on confirmed CDN analysis
function* phase1_priority(cards, skipSet) {
  for (const card of cards) {
    for (const base of BASES) {
      for (const num of card.nums) {
        for (const r of card.r.slice(0, 10)) { // Top 10 rarity prefixes
          for (const name of card.n.slice(0, 4)) { // Top 4 name variants
            for (const title of card.pri) {
              for (const w of WIDTHS_PRI) {
                for (const ext of EXTS_PRI) {
                  const url = `${base}${num}_${r}_${name}_${title}${w}${ext}`;
                  if (!skipSet.has(url)) yield { url, cardId: card.id };
                }
              }
            }
            // Also try name-only (no title, like 108_M_Naruto)
            for (const w of WIDTHS_PRI) {
              const url = `${base}${num}_${r}_${name}${w}.webp`;
              if (!skipSet.has(url)) yield { url, cardId: card.id };
            }
          }
        }
      }
    }
  }
}

// Phase 2: RARITY SWEEP — All rarity prefix combinations with priority titles
function* phase2_raritySweep(cards, skipSet) {
  for (const card of cards) {
    for (const base of BASES) {
      for (const num of card.nums) {
        for (const r of card.r) { // ALL rarity prefixes
          for (const name of card.n.slice(0, 3)) {
            for (const title of card.pri.slice(0, 20)) { // Top 20 titles
              for (const w of WIDTHS_ALL) {
                const url = `${base}${num}_${r}_${name}_${title}${w}.webp`;
                if (!skipSet.has(url)) yield { url, cardId: card.id };
              }
              // Also jpg/png for -1920w
              for (const ext of ['.jpg', '.png']) {
                const url = `${base}${num}_${r}_${name}_${title}-1920w${ext}`;
                if (!skipSet.has(url)) yield { url, cardId: card.id };
              }
            }
          }
        }
      }
    }
  }
}

// Phase 3: NAME EXPLOSION — All name spelling variants with all titles
function* phase3_nameExplosion(cards, skipSet) {
  for (const card of cards) {
    for (const base of BASES) {
      for (const num of card.nums) {
        for (const r of card.r.slice(0, 8)) {
          for (const name of card.n) { // ALL name variants
            for (const title of card.pri) {
              for (const w of ['-1920w', '-1280w', '-960w']) {
                const url = `${base}${num}_${r}_${name}_${title}${w}.webp`;
                if (!skipSet.has(url)) yield { url, cardId: card.id };
              }
            }
          }
        }
      }
    }
  }
}

// Phase 4: DICTIONARY — 700+ universal words as single-word titles
function* phase4_dictionary(cards, skipSet) {
  for (const card of cards) {
    const base = BASES[0]; // Primary base only
    for (const num of card.nums) {
      for (const r of card.r.slice(0, 8)) {
        for (const name of card.n.slice(0, 3)) {
          for (const word of UNIVERSAL_DICT) {
            const url = `${base}${num}_${r}_${name}_${word}-1920w.webp`;
            if (!skipSet.has(url)) yield { url, cardId: card.id };
            // Also lowercase
            const urlLc = `${base}${num}_${r}_${name}_${word.toLowerCase()}-1920w.webp`;
            if (!skipSet.has(urlLc)) yield { url: urlLc, cardId: card.id };
          }
        }
      }
    }
  }
}

// Phase 5: 2-WORD COMBINATIONS — All A_B pairs from combo word pool
function* phase5_pairCombos(cards, skipSet) {
  for (const card of cards) {
    const base = BASES[0];
    const words = card.cmb;
    for (const num of card.nums) {
      for (const r of card.r.slice(0, 6)) {
        for (const name of card.n.slice(0, 2)) {
          for (let i = 0; i < words.length; i++) {
            for (let j = 0; j < words.length; j++) {
              if (i === j) continue;
              const title = `${words[i]}_${words[j]}`;
              const url = `${base}${num}_${r}_${name}_${title}-1920w.webp`;
              if (!skipSet.has(url)) yield { url, cardId: card.id };
            }
          }
        }
      }
    }
  }
}

// Phase 6: 3-WORD COMBINATIONS — All A_B_C triplets (the BIG phase, ~26M+ URLs)
function* phase6_tripleCombos(cards, skipSet) {
  for (const card of cards) {
    const base = BASES[0];
    const words = card.cmb;
    for (const num of card.nums) {
      for (const r of card.r.slice(0, 5)) {
        for (const name of card.n.slice(0, 2)) {
          for (let i = 0; i < words.length; i++) {
            for (let j = 0; j < words.length; j++) {
              if (j === i) continue;
              for (let k = 0; k < words.length; k++) {
                if (k === i || k === j) continue;
                const title = `${words[i]}_${words[j]}_${words[k]}`;
                const url = `${base}${num}_${r}_${name}_${title}-1920w.webp`;
                if (!skipSet.has(url)) yield { url, cardId: card.id };
              }
            }
          }
        }
      }
    }
  }
}

// Phase 7: TYPO ENGINE — CDN-style spelling errors on priority titles
function* phase7_typoEngine(cards, skipSet) {
  for (const card of cards) {
    for (const base of BASES) {
      for (const num of card.nums) {
        for (const r of card.r.slice(0, 8)) {
          for (const name of card.n.slice(0, 3)) {
            for (const title of card.pri.slice(0, 15)) {
              const typos = generateTitleTypos(title);
              for (const typo of typos) {
                const url = `${base}${num}_${r}_${name}_${typo}-1920w.webp`;
                if (!skipSet.has(url)) yield { url, cardId: card.id };
              }
            }
          }
        }
      }
    }
  }
}

// Phase 8: STRUCTURAL VARIANTS — Alternative URL formats
function* phase8_structural(cards, skipSet) {
  for (const card of cards) {
    for (const base of BASES) {
      for (const num of card.nums) {
        for (const r of card.r.slice(0, 8)) {
          for (const name of card.n.slice(0, 3)) {
            for (const title of card.pri.slice(0, 20)) {
              // 8a: Hyphen between name and title (Kabuto-style: 52_C_Kabuto-Infiltrator)
              const urlHyphen = `${base}${num}_${r}_${name}-${title}-1920w.webp`;
              if (!skipSet.has(urlHyphen)) yield { url: urlHyphen, cardId: card.id };

              // 8b: All hyphens instead of underscores in title
              const titleHyphen = title.replace(/_/g, '-');
              const urlAllHyphen = `${base}${num}_${r}_${name}_${titleHyphen}-1920w.webp`;
              if (!skipSet.has(urlAllHyphen)) yield { url: urlAllHyphen, cardId: card.id };

              // 8c: CamelCase title (no separator)
              const titleCamel = title.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('');
              const urlCamel = `${base}${num}_${r}_${name}_${titleCamel}-1920w.webp`;
              if (!skipSet.has(urlCamel)) yield { url: urlCamel, cardId: card.id };

              // 8d: Reversed order: title_name
              const urlReversed = `${base}${num}_${r}_${title}_${name}-1920w.webp`;
              if (!skipSet.has(urlReversed)) yield { url: urlReversed, cardId: card.id };

              // 8e: No rarity prefix: num_name_title
              const urlNoRarity = `${base}${num}_${name}_${title}-1920w.webp`;
              if (!skipSet.has(urlNoRarity)) yield { url: urlNoRarity, cardId: card.id };

              // 8f: Set prefix: KS_num_rarity_name_title
              const urlKS = `${base}KS_${num}_${r}_${name}_${title}-1920w.webp`;
              if (!skipSet.has(urlKS)) yield { url: urlKS, cardId: card.id };

              // 8g: Full lowercase
              const urlLower = `${base}${num}_${r.toLowerCase()}_${name.toLowerCase()}_${title.toLowerCase()}-1920w.webp`;
              if (!skipSet.has(urlLower)) yield { url: urlLower, cardId: card.id };

              // 8h: Full name format: num_rarity_FirstName_LastName_title
              // (Some CDN names use full names like Neji_Hyuga)
              // Already covered by name variants, skip if single-word name

              // 8i: Art/Holo prefix: num_rarity_HOLO_name_title
              for (const artPrefix of ['HOLO_', 'FULL_', 'ALT_', 'ART_', 'FOIL_', 'V_']) {
                const urlArt = `${base}${num}_${r}_${artPrefix}${name}_${title}-1920w.webp`;
                if (!skipSet.has(urlArt)) yield { url: urlArt, cardId: card.id };
              }
            }
          }
        }
      }
    }
  }
}

// ─── HTTP ENGINE ────────────────────────────────────────────────────────────

let totalTested = 0;
let totalNew = 0;
let totalFound = 0;
const foundImages = [];
const phaseStats = {};
let currentPhase = '';
const startTime = Date.now();
let lastSaveTime = Date.now();
// No testedUrls array — this was causing OOM. Progress tracks counts only.

function headCheck(url) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD', agent, timeout: TIMEOUT_MS }, (res) => {
      const len = parseInt(res.headers['content-length'] || '0', 10);
      res.resume();
      resolve(res.statusCode === 200 && len >= MIN_FILE_SIZE ? len : 0);
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.end();
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { agent, timeout: 15000 }, (res) => {
      if (res.statusCode !== 200) { file.close(); fs.unlinkSync(dest); return reject(); }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', () => { file.close(); try { fs.unlinkSync(dest); } catch {} reject(); });
  });
}

async function processUrl(url, cardId) {
  totalTested++;
  totalNew++;

  const size = await headCheck(url);
  if (size > 0) {
    totalFound++;
    const filename = url.split('/').pop().replace(/[?#].*/,'');
    const dest = path.join(OUT_DIR, `${cardId}_${filename}`);
    try {
      await downloadFile(url, dest);
      foundImages.push({ cardId, url, filename, size, dest });
      console.log(`\n  >>> FOUND: ${cardId} -> ${filename} (${(size/1024).toFixed(1)} KB) <<<\n`);
    } catch {
      foundImages.push({ cardId, url, filename, size, dest: 'DOWNLOAD_FAILED' });
      console.log(`\n  >>> FOUND (download failed): ${cardId} -> ${url} <<<\n`);
    }
  }
}

async function processBatch(batch) {
  await Promise.all(batch.map(({ url, cardId }) => processUrl(url, cardId)));
}

async function processPhase(name, generator) {
  currentPhase = name;
  phaseStats[name] = { started: Date.now(), urls: 0 };
  console.log(`\n  Phase: ${name}`);

  let batch = [];
  for (const item of generator) {
    batch.push(item);
    phaseStats[name].urls++;

    if (batch.length >= CONCURRENCY) {
      await processBatch(batch);
      batch = [];

      // Periodic save
      if (Date.now() - lastSaveTime > SAVE_INTERVAL) {
        saveProgress();
        lastSaveTime = Date.now();
      }

      // Dashboard update
      printDashboard();
    }
  }
  // Process remaining
  if (batch.length > 0) {
    await processBatch(batch);
  }

  phaseStats[name].ended = Date.now();
  const dur = ((phaseStats[name].ended - phaseStats[name].started) / 1000).toFixed(0);
  console.log(`  Phase ${name} complete: ${phaseStats[name].urls.toLocaleString()} URLs in ${dur}s`);
}

// ─── PROGRESS SAVE ──────────────────────────────────────────────────────────

function saveProgress() {
  try {
    const data = {
      found: foundImages,
      totalTested,
      totalNew,
      phaseStats: Object.fromEntries(
        Object.entries(phaseStats).map(([k, v]) => [k, { urls: v.urls }])
      ),
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data));
  } catch {}
}

// ─── LIVE DASHBOARD ─────────────────────────────────────────────────────────

let lastDashTime = 0;
function printDashboard() {
  const now = Date.now();
  if (now - lastDashTime < 2000) return; // Update every 2s max
  lastDashTime = now;

  const elapsed = ((now - startTime) / 1000).toFixed(0);
  const rate = totalNew > 0 ? (totalNew / ((now - startTime) / 1000)).toFixed(0) : 0;

  process.stdout.write(
    `\r  [${currentPhase}] Tested: ${totalNew.toLocaleString()} | ` +
    `Rate: ${rate}/s | Found: ${totalFound} | ` +
    `Elapsed: ${Math.floor(elapsed/3600)}h${Math.floor((elapsed%3600)/60)}m${elapsed%60}s   `
  );
}

// ─── REPORT ─────────────────────────────────────────────────────────────────

function writeReport() {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const rate = totalNew > 0 ? (totalNew / ((Date.now() - startTime) / 1000)).toFixed(0) : 0;

  let report = `BRUTE11-HYPERION REPORT\n`;
  report += `Duration: ${Math.floor(elapsed/3600)}h${Math.floor((elapsed%3600)/60)}m${elapsed%60}s\n`;
  report += `New URLs tested: ${totalNew.toLocaleString()}\n`;
  report += `Rate: ${rate}/s\n`;
  report += `Found: ${totalFound}\n\n`;

  if (foundImages.length > 0) {
    report += `FOUND IMAGES:\n`;
    for (const img of foundImages) {
      report += `  ${img.cardId} -> ${img.url}\n`;
      report += `    File: ${img.dest}\n`;
    }
    report += `\n`;
  }

  const foundIds = new Set(foundImages.map(f => f.cardId));
  const missing = CARDS.filter(c => !foundIds.has(c.id));
  report += `STILL MISSING (${missing.length}):\n`;
  for (const c of missing) {
    report += `  ${c.id}\n`;
  }
  report += `\n`;

  report += `PHASE STATS:\n`;
  for (const [name, stats] of Object.entries(phaseStats)) {
    const dur = stats.ended ? ((stats.ended - stats.started) / 1000).toFixed(0) : '?';
    report += `  ${name}: ${stats.urls.toLocaleString()} URLs in ${dur}s\n`;
  }

  fs.writeFileSync(REPORT_FILE, report);
  console.log(`\n\nReport saved to ${REPORT_FILE}`);
}

// ─── MAIN ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(70));
  console.log('  BRUTE11-HYPERION  |  50,000 concurrent  |  ~44M URLs  |  22 cards');
  console.log('='.repeat(70));

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('\n  Loading previous progress...');
  const skipSet = loadAllProgress();
  console.log(`  Skip set size: ${skipSet.size.toLocaleString()}`);
  console.log(`  Cards: ${CARDS.length}`);
  console.log(`  Concurrency: ${CONCURRENCY.toLocaleString()}`);

  // Graceful shutdown
  let shutdownRequested = false;
  process.on('SIGINT', () => {
    if (shutdownRequested) process.exit(1);
    shutdownRequested = true;
    console.log('\n\n  Shutting down gracefully... (Ctrl+C again to force)');
    saveProgress();
    writeReport();
    process.exit(0);
  });

  // Free skipSet after building generators to reclaim ~150MB
  // (generators capture the reference but only read during iteration)

  // Execute all 8 phases sequentially
  const phases = [
    ['PH1_PRIORITY', phase1_priority],
    ['PH2_RARITY', phase2_raritySweep],
    ['PH3_NAMES', phase3_nameExplosion],
    ['PH4_DICT', phase4_dictionary],
    ['PH5_PAIRS', phase5_pairCombos],
    ['PH6_TRIPLES', phase6_tripleCombos],
    ['PH7_TYPOS', phase7_typoEngine],
    ['PH8_STRUCT', phase8_structural],
  ];

  for (const [name, genFn] of phases) {
    if (shutdownRequested) break;
    await processPhase(name, genFn(CARDS, skipSet));
    saveProgress();
  }

  // Final
  saveProgress();
  writeReport();

  console.log('\n' + '='.repeat(70));
  console.log(`  COMPLETE  |  ${totalNew.toLocaleString()} URLs tested  |  ${totalFound} found`);
  console.log('='.repeat(70));

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  saveProgress();
  writeReport();
  process.exit(1);
});
