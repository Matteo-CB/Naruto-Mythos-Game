#!/usr/bin/env node
/**
 * brute12-surgical.js  —  SURGICAL PER-CARD IMAGE FINDER
 *
 * Searches ONE card at a time, exhausting all intelligent patterns before
 * moving to the next card. Skips ALL URLs already tested by brute 6-10-11.
 *
 * Strategy: For each missing card, generate URLs using patterns learned
 * from the 122 confirmed gallery URLs, with card-specific title intelligence.
 *
 * Concurrency: 100 workers (gentle, reliable, no OOM)
 *
 * Usage:  node scripts/brute12-surgical.js
 * Stop:   Ctrl+C  (progress saved, resumable)
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ─── CONFIG ────────────────────────────────────────────────────────────────
const CONCURRENCY    = 100;
const TIMEOUT_MS     = 5000;
const MIN_FILE_SIZE  = 5000;
const OUT_DIR        = path.join(__dirname, '..', 'newvisual');
const PROGRESS_FILE  = path.join(OUT_DIR, 'brute12_progress.json');
const REPORT_FILE    = path.join(OUT_DIR, 'brute12_report.txt');

const BASE = 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/';
const WIDTHS = ['-1920w', '-1280w', '-960w', '-640w', '-480w'];
const EXTS   = ['.webp', '.jpg', '.png'];

const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 200,
  maxFreeSockets: 50,
  timeout: TIMEOUT_MS,
});

// ─── KNOWN CDN PATTERNS (from 122 confirmed gallery URLs) ──────────────────
//
// Format: {num}_{rarity}_{name}_{title}-{width}w.{ext}
//
// Key observations:
//   C cards:  {num}_C_{Name}_{Title}         e.g. 44_C_Anko_Proctor
//   UC cards: {num}_UC_{Name}_{Title}        e.g. 58_UC_Jirobo_Earth_Dome
//   R cards:  {num}_R_{Name}_{Title}         e.g. 120_R_Gaara_Sand_Coffin
//   RA cards: {num}_R_ART_{Name}_{Title}     e.g. 109_R_ART_Sakura_Medical
//   S cards:  {num}_{SecretV_GOLD|Secret_GOLD}_{Name}_{Title}
//   M cards:  {num}_M_Special_{Name}_{Title} e.g. 143_M_Special_Itachi_Hunting
//   MV cards: Unknown — need to discover pattern
//
// Spelling quirks:
//   57_C_Jiroubou (C) vs 58_UC_Jirobo (UC)  — name changes between rarities!
//   76_UC_One-Tail_Partial_Trasformation     — CDN has typo "Trasformation"
//   84_C_Yashamaru_Careteaker                — CDN has typo "Careteaker"
//   55_C_Kimimaro_Camelia_Dance              — CDN has typo "Camelia"
//   52_C_Kabuto-Infiltrator                  — hyphen between name-title
//   Sound Four C versions ALL use "Bearer" as title
//   42_C_MightGuy (no space)   30_C_Hinata_Gentle_fist (lowercase 'fist')
//   RockLee (no space)   KinTsuchi (no space in UC)
//
// Secret pattern: alternates SecretV_GOLD / Secret_GOLD
//   131=SecretV, 132=Secret, 133=SecretV, 134=?, 135=Secret, 136=SecretV, 137=SecretV, 138=Secret
//   Pattern: odd numbers = SecretV_GOLD, even numbers = Secret_GOLD (with exceptions)
//

// ─── SKIP SET — Load all previously tested URLs ────────────────────────────

function loadSkipSet() {
  const skipSet = new Set();
  const progressFiles = [
    path.join(OUT_DIR, 'brute6_progress.json'),
    path.join(OUT_DIR, 'brute7_progress.json'),
    path.join(OUT_DIR, 'brute8_progress.json'),
    path.join(OUT_DIR, 'brute9_progress.json'),
    path.join(OUT_DIR, 'brute10_progress.json'),
    // brute11 no longer saves testedUrls (fixed OOM), so skip it
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
  console.log(`  Loaded ${loaded.toLocaleString()} skip URLs from brute 6-10`);
  return skipSet;
}

// ─── CARD DEFINITIONS ──────────────────────────────────────────────────────
// Each card has highly targeted title lists based on:
//   1. Known CDN naming patterns for similar cards
//   2. The card's actual effect/title from the game data
//   3. Common CDN misspellings

const CARDS = [
  // ═══════════════════════════════════════════════════════════════════════════
  // KS-045-UC — Anko Mitarashi
  // CDN has: 44_C_Anko_Proctor (Common version)
  // UC version likely has a technique title (like other UC cards)
  {
    id: 'KS-045-UC', num: 45,
    names: ['Anko', 'Anko_Mitarashi', 'AnkoMitarashi', 'Mitarashi'],
    rarities: ['UC', 'Uncommon'],
    titles: [
      // Effect: Shadow Snake Hands — most likely CDN title
      'Shadow_Snake', 'Shadow_Snake_Hands', 'Snake_Hands',
      'Striking_Shadow_Snake', 'Striking_Shadow', 'Hidden_Snake',
      'Senei_Jashu', 'Senei_Ta_Jashu', 'Senei',
      // Role-based (like C=Proctor)
      'Examiner', 'Special_Jonin', 'Forest_Death',
      'Proctor', 'Undercover', 'Assassin', 'Jonin',
      // Alternative technique names
      'Snake_Strike', 'Serpent_Strike', 'Shadow_Serpent',
      'Twin_Snake', 'Hidden_Shadow_Snake', 'Snake_Authority',
      'Snake_Shadow', 'Viper', 'Cobra', 'Serpent',
      'Shadow_Snake_Hand', 'Striking_Snake',
      'Many_Hidden_Shadow_Snake', 'Dual_Snake',
      // French
      'Serpent_Ombre', 'Mains_Serpent', 'Serpents_Caches',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KS-115-R — Shino Aburame
  // No Shino in gallery at all (only 32_C_Shino_Parasitic_Insects)
  // R card likely uses a technique name
  {
    id: 'KS-115-R', num: 115,
    names: ['Shino', 'Shino_Aburame', 'ShinoAburame', 'Aburame'],
    rarities: ['R'],
    titles: [
      // Shino's signature moves
      'Insect_Swarm', 'Bug_Swarm', 'Parasitic_Insects', 'Kikaichuu',
      'Kikaichu', 'Insect_Wall', 'Bug_Wall', 'Bug_Barrier',
      'Insect_Clone', 'Bug_Clone', 'Insect_Sphere', 'Bug_Sphere',
      'Insect_Jar', 'Bug_Jar', 'Secret_Technique', 'Insect_Cocoon',
      'Insect_Gathering', 'Bug_Gathering', 'Destruction_Bug',
      'Parasitic_Giant', 'Giant_Bug', 'Insect_Jamming',
      'Bug_Jamming', 'Human_Bug_Clone', 'Spindle_Formation',
      'Insect_Shield', 'Bug_Shield', 'Aburame_Technique',
      // CDN might use French
      'Insectes_Parasites', 'Essaim', 'Mur_Insectes',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KS-115-RA — Shino Aburame (Rare Art)
  // RA pattern: {num}_R_ART_{Name}_{Title}
  {
    id: 'KS-115-RA', num: 115,
    names: ['Shino', 'Shino_Aburame', 'ShinoAburame', 'Aburame'],
    rarities: ['R_ART'],
    titles: [
      'Insect_Swarm', 'Bug_Swarm', 'Parasitic_Insects', 'Kikaichuu',
      'Kikaichu', 'Insect_Wall', 'Bug_Wall', 'Bug_Barrier',
      'Insect_Clone', 'Bug_Clone', 'Insect_Sphere', 'Bug_Sphere',
      'Insect_Jar', 'Bug_Jar', 'Secret_Technique', 'Insect_Cocoon',
      'Insect_Gathering', 'Bug_Gathering', 'Destruction_Bug',
      'Parasitic_Giant', 'Human_Bug_Clone', 'Spindle_Formation',
      'Insect_Shield', 'Bug_Shield',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KS-116-RA — Neji Hyuga (Rare Art)
  // CDN has: 36_C_Neji_Gentle_fist, 37_UC_Neji_Palm_Rotation
  // R version might be 8 Trigrams, RA = R_ART variant
  {
    id: 'KS-116-RA', num: 116,
    names: ['Neji', 'Neji_Hyuga', 'NejiHyuga', 'Hyuga'],
    rarities: ['R_ART'],
    titles: [
      // Neji's signature techniques
      'Eight_Trigrams', '64_Palms', 'Sixty_Four_Palms', 'Hakke',
      'Rokujuyon_Sho', 'Rotation', 'Palm_Rotation', 'Air_Palm',
      'Gentle_Fist', 'Gentle_fist', 'Byakugan', 'Mountain_Crusher',
      'Eight_Trigrams_64', 'Trigrams_64_Palms', 'Eight_Trigrams_Palms',
      '128_Palms', 'Vacuum_Palm', 'Palm_Bottom', 'Palm_Strike',
      'Heavenly_Spin', 'Revolving_Heaven',
      // CDN may use simpler names
      'Prodigy', 'Hyuga_Prodigy', 'Fate', 'Destiny',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KS-122-R — Jirobo
  // CDN: 57_C_Jiroubou_Bearer, 58_UC_Jirobo_Earth_Dome
  // Note different spellings! C=Jiroubou, UC=Jirobo
  {
    id: 'KS-122-R', num: 122,
    names: ['Jirobo', 'Jiroubou', 'Jirobou', 'Jiroubou', 'Jirobô'],
    rarities: ['R'],
    titles: [
      // Jirobo's R card likely a power technique
      'Earth_Dome', 'Earth_Mausoleum', 'Sphere_Graves',
      'Earth_Release', 'Earth_Wall', 'Doton',
      'Curse_Mark', 'Cursed_Seal', 'Second_State',
      'Level_2', 'Stage_2', 'Transformed',
      'Earth_Rising_Stone', 'Rock_Fist', 'Stone_Fist',
      'Earth_Golem', 'Barrier', 'Devouring',
      'Earth_Prison', 'Earth_Cage', 'Earth_Bind',
      'Sound_Four', 'Bearer', 'Guardian',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KS-122-RA — Jirobo (Rare Art)
  {
    id: 'KS-122-RA', num: 122,
    names: ['Jirobo', 'Jiroubou', 'Jirobou', 'Jiroubou'],
    rarities: ['R_ART'],
    titles: [
      'Earth_Dome', 'Earth_Mausoleum', 'Sphere_Graves',
      'Earth_Release', 'Curse_Mark', 'Cursed_Seal', 'Second_State',
      'Earth_Rising_Stone', 'Rock_Fist', 'Stone_Fist',
      'Earth_Golem', 'Barrier', 'Devouring',
      'Earth_Prison', 'Earth_Cage',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KS-124-R — Kidomaru
  // CDN: 59_C_Kidomaru_Bearer, 60_UC_Kidomaru_Spider_Web
  {
    id: 'KS-124-R', num: 124,
    names: ['Kidomaru', 'Kidoumaru', 'Kidômaru'],
    rarities: ['R'],
    titles: [
      // Kidomaru's R card = stronger technique
      'Spider_Web', 'Spider_War_Bow', 'Spider_Bow',
      'Spider_Sticky_Gold', 'Sticky_Gold', 'Golden_Spider',
      'Curse_Mark', 'Cursed_Seal', 'Second_State',
      'Level_2', 'Six_Arms', 'Third_Eye',
      'Spider_Thread', 'Spider_Net', 'Web',
      'Kumoshibari', 'Kumo', 'Spider',
      'Spider_Bind', 'Cocoon', 'Spider_Cocoon',
      'Arrow', 'Spider_Arrow', 'War_Bow',
      'Bearer', 'Sound_Four',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KS-124-RA — Kidomaru (Rare Art)
  {
    id: 'KS-124-RA', num: 124,
    names: ['Kidomaru', 'Kidoumaru', 'Kidômaru'],
    rarities: ['R_ART'],
    titles: [
      'Spider_Web', 'Spider_War_Bow', 'Spider_Bow',
      'Spider_Sticky_Gold', 'Sticky_Gold', 'Golden_Spider',
      'Curse_Mark', 'Cursed_Seal', 'Second_State',
      'Six_Arms', 'Third_Eye', 'Spider_Thread', 'Spider_Net',
      'Spider_Bind', 'Cocoon', 'Arrow', 'Spider_Arrow',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KS-126-R — Orochimaru
  // CDN: 50_C_Orochimaru_Undercover, 51_UC_Orochimaru_Substitution
  {
    id: 'KS-126-R', num: 126,
    names: ['Orochimaru', 'OROCHIMARU'],
    rarities: ['R'],
    titles: [
      // R Orochimaru — powerful technique
      'Reanimation', 'Edo_Tensei', 'Impure_World',
      'Living_Corpse', 'Transference', 'Body_Transfer',
      'Eight_Headed_Serpent', 'White_Snake', 'Manda',
      'Triple_Rashomon', 'Kusanagi', 'Grass_Cutter',
      'Snake_Sage', 'Summoning', 'Five_Pronged_Seal',
      'Curse_Mark', 'Cursed_Seal', 'Immortality',
      'Sannin', 'Shadow_Clone', 'Wind_Release',
      'Face_Steal', 'Disguise', 'Formation',
      'Snake_Authority', 'Hidden_Shadow', 'Forbidden',
      'Substitution', 'Undercover',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KS-127-R — Sakon
  // CDN: 61_C_Sakon_Bearer, 62_UC_Sakon_Black_Seal
  {
    id: 'KS-127-R', num: 127,
    names: ['Sakon', 'Sakon_Ukon', 'SakonUkon', 'Ukon'],
    rarities: ['R'],
    titles: [
      // R Sakon — curse mark / Ukon techniques
      'Black_Seal', 'Curse_Mark', 'Cursed_Seal', 'Second_State',
      'Level_2', 'Demon_Twins', 'Twin_Demon',
      'Parasite', 'Parasitic_Demon', 'Body_Fusion',
      'Multiple_Fists', 'Barrage', 'Demolishing_Fist',
      'Ukon_Fusion', 'Twin', 'Brothers',
      'Rashomon', 'Summoning_Rashomon',
      'Sound_Four', 'Bearer', 'Cell',
      'Molecular_Possession', 'Possession',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KS-127-RA — Sakon (Rare Art)
  {
    id: 'KS-127-RA', num: 127,
    names: ['Sakon', 'Sakon_Ukon', 'SakonUkon', 'Ukon'],
    rarities: ['R_ART'],
    titles: [
      'Black_Seal', 'Curse_Mark', 'Cursed_Seal', 'Second_State',
      'Demon_Twins', 'Twin_Demon', 'Parasite',
      'Multiple_Fists', 'Barrage', 'Demolishing_Fist',
      'Ukon_Fusion', 'Rashomon', 'Molecular_Possession',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KS-129-R — Kyubi (Nine-Tails)
  // CDN: 76_UC_One-Tail_Partial_Trasformation (note typo + hyphen in One-Tail)
  {
    id: 'KS-129-R', num: 129,
    names: ['Kyubi', 'Kyuubi', 'Nine-Tails', 'Nine_Tails', 'NineTails', 'Kurama', 'Nine-Tail', 'Nine_Tail'],
    rarities: ['R'],
    titles: [
      // Kyubi/Nine-Tails patterns (based on One-Tail: "Partial_Trasformation")
      'Partial_Trasformation', 'Partial_Transformation',
      'Trasformation', 'Transformation',
      'Chakra_Cloak', 'Chakra_Shroud', 'Cloak',
      'One_Tail_Cloak', 'Two_Tail_Cloak', 'Three_Tail_Cloak',
      'Four_Tail_Cloak', 'Tail_Cloak', 'Tailed_Cloak',
      'Rage', 'Rampage', 'Berserk', 'Unleashed',
      'Jinchuriki', 'Jinchuuriki', 'Beast', 'Fox',
      'Demon_Fox', 'Fox_Cloak', 'Fox_Spirit',
      'Nine_Tails_Cloak', 'Bijuu_Cloak', 'Tailed_Beast',
      'Menacing_Ball', 'Tailed_Beast_Ball',
      'Version_1', 'Version_2', 'V1', 'V2',
      'Red_Chakra', 'Chakra_Mode',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KS-129-RA — Kyubi (Rare Art)
  {
    id: 'KS-129-RA', num: 129,
    names: ['Kyubi', 'Kyuubi', 'Nine-Tails', 'Nine_Tails', 'NineTails', 'Kurama', 'Nine-Tail', 'Nine_Tail'],
    rarities: ['R_ART'],
    titles: [
      'Partial_Trasformation', 'Partial_Transformation',
      'Chakra_Cloak', 'Chakra_Shroud', 'Cloak',
      'Rage', 'Rampage', 'Berserk', 'Unleashed',
      'Jinchuriki', 'Demon_Fox', 'Fox_Cloak',
      'Nine_Tails_Cloak', 'Tailed_Beast', 'Menacing_Ball',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KS-130-R — One-Tail (Shukaku)
  // CDN: 76_UC_One-Tail_Partial_Trasformation (UC version)
  // R version likely a more complete transformation
  {
    id: 'KS-130-R', num: 130,
    names: ['One-Tail', 'One_Tail', 'OneTail', 'Shukaku', 'Ichibi'],
    rarities: ['R'],
    titles: [
      // Based on UC: "Partial_Trasformation"
      'Full_Trasformation', 'Full_Transformation',
      'Complete_Trasformation', 'Complete_Transformation',
      'Trasformation', 'Transformation',
      'Partial_Trasformation', 'Partial_Transformation',
      'Sand_Storm', 'Sandstorm', 'Sand_Burial',
      'Wind_Release', 'Air_Bullets', 'Wind_Bullets',
      'Tailed_Beast', 'Beast', 'Awakened', 'Released',
      'Tanuki', 'Raccoon', 'Spirit',
      'Possession', 'Gaara_Possessed',
      'Tailed_Beast_Ball', 'Menacing_Ball',
      'Jinchuriki', 'Jinchuuriki',
      'Sand_Shield', 'Sand',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KS-134-S — Kyubi (Secret)
  // Secret pattern: 131=SecretV_GOLD, 132=Secret_GOLD, 133=SecretV_GOLD,
  //   134=? (could be Secret_GOLD or SecretV_GOLD), 135=Secret_GOLD
  // 134 is even → likely Secret_GOLD
  {
    id: 'KS-134-S', num: 134,
    names: ['Kyubi', 'Kyuubi', 'Nine-Tails', 'Nine_Tails', 'NineTails', 'Kurama', 'Nine-Tail', 'Nine_Tail'],
    rarities: ['Secret_GOLD', 'SecretV_GOLD', 'Secret', 'SecretV', 'S', 'S_GOLD'],
    titles: [
      // Secret Kyubi — dramatic name expected
      'Rage', 'Rampage', 'Unleashed', 'Awakened',
      'Nine_Tails_Cloak', 'Chakra_Cloak', 'Fox_Cloak',
      'Demon_Fox', 'Tailed_Beast', 'Bijuu',
      'Menacing_Ball', 'Tailed_Beast_Ball',
      'Jinchuriki', 'Jinchuuriki',
      'Berserk', 'Release', 'Full_Release',
      'Red_Chakra', 'Chakra_Mode', 'Beast_Mode',
      'Destruction', 'Devastation', 'Annihilation',
      'Nine_Tails', 'Fox_Spirit', 'Fox',
      'Kurama', 'Partial_Trasformation', 'Partial_Transformation',
      'Full_Trasformation', 'Full_Transformation',
      'Trasformation', 'Transformation',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KS-135-MV — Sakura (Mythos V)
  // CDN Mythos: 143_M_Special_Itachi_Hunting, 144_M_Special_Kisame_Chakra_absorb
  // Secret Sakura: 135_Secret_GOLD_Sakura_Recovery_Team
  // MV pattern unknown — try M_Special, MV, MV_Special, etc.
  {
    id: 'KS-135-MV', num: 135,
    names: ['Sakura', 'Sakura_Haruno', 'SakuraHaruno', 'Haruno'],
    rarities: ['MV', 'MV_Special', 'M_Special', 'MV_GOLD', 'M_V', 'V_Special', 'MythosV', 'Mythos_V'],
    titles: [
      // Sakura techniques
      'Medical', 'Medical_Ninja', 'Healing', 'Recovery',
      'Recovery_Team', 'Cherry_Blossom', 'Blossom',
      'Chakra_Prowess', 'Inner_Sakura', 'Strength',
      'Super_Strength', 'Punch', 'CES', 'Chakra_Enhanced',
      'Hundred_Healings', 'Creation_Rebirth',
      'Byakugou', 'Yin_Seal', 'Summoning_Katsuyu',
      'Genin', 'Kunoichi', 'Team_7', 'Apprentice',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KS-136-MV — Sasuke (Mythos V)
  // Secret Sasuke: 136_SecretV_GOLD_Sasuke_Heaven_Curse_Mark
  {
    id: 'KS-136-MV', num: 136,
    names: ['Sasuke', 'Sasuke_Uchiha', 'SasukeUchiha', 'Uchiha'],
    rarities: ['MV', 'MV_Special', 'M_Special', 'MV_GOLD', 'M_V', 'V_Special', 'MythosV', 'Mythos_V'],
    titles: [
      // Sasuke techniques
      'Heaven_Curse_Mark', 'Curse_Mark', 'Cursed_Seal',
      'Chidori', 'Lightning_Blade', 'Sharingan',
      'Lion_Combo', 'Phoenix_Flower', 'Fireball',
      'Avenger', 'Last_Uchiha', 'Genin', 'Rogue',
      'Hawk', 'Snake', 'Team_7', 'Mangekyo',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KS-149-MV — Kiba (Mythos V)
  // CDN: 25_C_Kiba_Genin, 26_UC_Kiba_All_Four
  {
    id: 'KS-149-MV', num: 149,
    names: ['Kiba', 'Kiba_Inuzuka', 'KibaInuzuka', 'Inuzuka'],
    rarities: ['MV', 'MV_Special', 'M_Special', 'MV_GOLD', 'M_V', 'V_Special', 'MythosV', 'Mythos_V'],
    titles: [
      // Kiba techniques
      'All_Four', 'Fang_Over_Fang', 'Gatsuuga', 'Tsuga',
      'Man_Beast_Clone', 'Two_Headed_Wolf', 'Beast_Mimicry',
      'Fang_Passing_Fang', 'Inuzuka', 'Tracking',
      'Dynamic_Marking', 'Wild', 'Genin', 'Dog_Warrior',
      'Three_Headed_Wolf', 'Wolf_Fang',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KS-150-MV — Shikamaru (Mythos V)
  // CDN: 21_C_Shikamaru_Genin, 22_UC_Shikamaru_Shadow_Possession, 111_R_Shikamaru_Shadow_Strangle
  {
    id: 'KS-150-MV', num: 150,
    names: ['Shikamaru', 'Shikamaru_Nara', 'ShikamaruNara', 'Nara'],
    rarities: ['MV', 'MV_Special', 'M_Special', 'MV_GOLD', 'M_V', 'V_Special', 'MythosV', 'Mythos_V'],
    titles: [
      'Shadow_Possession', 'Shadow_Strangle', 'Shadow_Bind',
      'Shadow_Stitching', 'Shadow_Gathering',
      'Genius', 'Strategist', 'Genin', 'Chunin',
      'IQ_200', 'Lazy_Genius', 'Shadow',
      'Nara_Technique', 'Shadow_Neck_Bind',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KS-151-MV — Rock Lee (Mythos V)
  // CDN: 38_C_RockLee_Training, 39_UC_RockLee_Primary_Lotus, 117_R_ART_RockLee_Loopy_Fist
  {
    id: 'KS-151-MV', num: 151,
    names: ['RockLee', 'Rock_Lee', 'Lee', 'RockLee'],
    rarities: ['MV', 'MV_Special', 'M_Special', 'MV_GOLD', 'M_V', 'V_Special', 'MythosV', 'Mythos_V'],
    titles: [
      'Primary_Lotus', 'Hidden_Lotus', 'Loopy_Fist',
      'Drunken_Fist', 'Lotus', 'Gate_Opening',
      'Five_Gates', 'Eight_Gates', 'Inner_Gates',
      'Leaf_Hurricane', 'Leaf_Whirlwind', 'Training',
      'Springtime_Youth', 'Youth', 'Green_Beast',
      'Taijutsu', 'Hard_Work',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KS-152-MV — Itachi (Mythos V)
  // CDN: 90_C_Itachi_Akatsuki, 143_M_Special_Itachi_Hunting
  {
    id: 'KS-152-MV', num: 152,
    names: ['Itachi', 'Itachi_Uchiha', 'ItachiUchiha', 'Uchiha_Itachi'],
    rarities: ['MV', 'MV_Special', 'M_Special', 'MV_GOLD', 'M_V', 'V_Special', 'MythosV', 'Mythos_V'],
    titles: [
      'Hunting', 'Akatsuki', 'Mangekyo', 'Sharingan',
      'Tsukuyomi', 'Amaterasu', 'Susanoo',
      'Genjutsu', 'Crow_Clone', 'Itachi_Clone',
      'Anbu', 'Prodigy', 'Uchiha_Prodigy',
      'Massacre', 'Sacrifice', 'Truth',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KS-153-MV — Gaara (Mythos V)
  // CDN: 74_C_Gaara_Jinchuriki, 75_C_Gaara_Sand_Shield, 120_R_Gaara_Sand_Coffin
  {
    id: 'KS-153-MV', num: 153,
    names: ['Gaara', 'Gaara_Sand', 'Sabaku_no_Gaara'],
    rarities: ['MV', 'MV_Special', 'M_Special', 'MV_GOLD', 'M_V', 'V_Special', 'MythosV', 'Mythos_V'],
    titles: [
      'Sand_Coffin', 'Sand_Burial', 'Sand_Shield',
      'Jinchuriki', 'Shukaku', 'One_Tail',
      'Sand_Tsunami', 'Sand_Lightning', 'Desert',
      'Desert_Coffin', 'Desert_Funeral', 'Kazekage',
      'Sand_Armor', 'Ultimate_Defense',
    ],
  },
];

// ─── URL GENERATOR ─────────────────────────────────────────────────────────
// For a single card, generates ALL intelligent URL combinations

function* generateUrlsForCard(card, skipSet) {
  const num = card.num;
  const nums = [String(num), String(num).padStart(2, '0'), String(num).padStart(3, '0')];

  for (const n of nums) {
    for (const r of card.rarities) {
      for (const name of card.names) {
        // Pattern A: Standard — {num}_{rarity}_{name}_{title}-{width}w.{ext}
        for (const title of card.titles) {
          for (const w of WIDTHS) {
            for (const ext of EXTS) {
              const url = `${BASE}${n}_${r}_${name}_${title}${w}${ext}`;
              if (!skipSet.has(url)) yield url;
            }
          }
        }

        // Pattern B: Name only (no title) — like 108_M_Naruto
        for (const w of WIDTHS) {
          for (const ext of EXTS) {
            const url = `${BASE}${n}_${r}_${name}${w}${ext}`;
            if (!skipSet.has(url)) yield url;
          }
        }

        // Pattern C: Hyphen between name-title (Kabuto-style)
        for (const title of card.titles.slice(0, 10)) {
          const url = `${BASE}${n}_${r}_${name}-${title}-1920w.webp`;
          if (!skipSet.has(url)) yield url;
        }

        // Pattern D: All-hyphen titles
        for (const title of card.titles.slice(0, 10)) {
          const titleH = title.replace(/_/g, '-');
          if (titleH !== title) {
            const url = `${BASE}${n}_${r}_${name}_${titleH}-1920w.webp`;
            if (!skipSet.has(url)) yield url;
          }
        }

        // Pattern E: Lowercase fist-style (Gentle_fist pattern)
        for (const title of card.titles.slice(0, 10)) {
          const parts = title.split('_');
          if (parts.length >= 2) {
            const lcTitle = parts[0] + '_' + parts.slice(1).map(p => p.toLowerCase()).join('_');
            if (lcTitle !== title) {
              const url = `${BASE}${n}_${r}_${name}_${lcTitle}-1920w.webp`;
              if (!skipSet.has(url)) yield url;
            }
          }
        }
      }
    }
  }

  // Pattern F: No rarity prefix (num_name_title)
  for (const n of [String(num)]) {
    for (const name of card.names.slice(0, 2)) {
      for (const title of card.titles.slice(0, 10)) {
        const url = `${BASE}${n}_${name}_${title}-1920w.webp`;
        if (!skipSet.has(url)) yield url;
      }
    }
  }

  // Pattern G: CDN typos on titles
  for (const n of [String(num)]) {
    for (const r of card.rarities.slice(0, 3)) {
      for (const name of card.names.slice(0, 2)) {
        for (const title of card.titles.slice(0, 8)) {
          const parts = title.split('_');
          for (let i = 0; i < parts.length; i++) {
            if (parts[i].length < 4) continue;
            // Drop a letter
            for (let j = 1; j < parts[i].length - 1; j++) {
              const typo = parts[i].slice(0, j) + parts[i].slice(j + 1);
              const newParts = [...parts]; newParts[i] = typo;
              const url = `${BASE}${n}_${r}_${name}_${newParts.join('_')}-1920w.webp`;
              if (!skipSet.has(url)) yield url;
            }
            // Double a letter
            for (let j = 0; j < parts[i].length; j++) {
              const typo = parts[i].slice(0, j) + parts[i][j] + parts[i].slice(j);
              const newParts = [...parts]; newParts[i] = typo;
              const url = `${BASE}${n}_${r}_${name}_${newParts.join('_')}-1920w.webp`;
              if (!skipSet.has(url)) yield url;
            }
          }
        }
      }
    }
  }
}

// ─── HTTP ENGINE ───────────────────────────────────────────────────────────

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
      if (res.statusCode !== 200) { file.close(); try { fs.unlinkSync(dest); } catch {} return reject(); }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', () => { file.close(); try { fs.unlinkSync(dest); } catch {} reject(); });
  });
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('  BRUTE12-SURGICAL  |  Per-card intelligent search');
  console.log('  Cards: ' + CARDS.length + '  |  Concurrency: ' + CONCURRENCY);
  console.log('='.repeat(60));

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Load skip set
  console.log('\n  Loading skip URLs...');
  const skipSet = loadSkipSet();
  console.log(`  Skip set: ${skipSet.size.toLocaleString()} URLs\n`);

  // Load previous progress (resume support)
  let foundCards = new Set();
  let totalTested = 0;
  const allFound = [];
  try {
    const prev = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    if (prev.found) {
      for (const f of prev.found) {
        foundCards.add(f.cardId);
        allFound.push(f);
      }
    }
    if (prev.totalTested) totalTested = prev.totalTested;
    if (foundCards.size > 0) {
      console.log(`  Resuming: ${foundCards.size} cards already found, ${totalTested.toLocaleString()} tested\n`);
    }
  } catch {}

  // Graceful shutdown
  let shutdownRequested = false;
  process.on('SIGINT', () => {
    if (shutdownRequested) process.exit(1);
    shutdownRequested = true;
    console.log('\n\n  Shutting down... saving progress...');
    saveAll();
    process.exit(0);
  });

  function saveAll() {
    try {
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
        found: allFound,
        foundCardIds: [...foundCards],
        totalTested,
        timestamp: new Date().toISOString(),
      }));
    } catch {}
    writeReport();
  }

  function writeReport() {
    let report = `BRUTE12-SURGICAL REPORT\n`;
    report += `Total tested: ${totalTested.toLocaleString()}\n`;
    report += `Found: ${allFound.length}\n\n`;
    if (allFound.length > 0) {
      report += 'FOUND:\n';
      for (const f of allFound) report += `  ${f.cardId} -> ${f.url}\n`;
      report += '\n';
    }
    const missing = CARDS.filter(c => !foundCards.has(c.id));
    report += `STILL MISSING (${missing.length}):\n`;
    for (const c of missing) report += `  ${c.id}\n`;
    try { fs.writeFileSync(REPORT_FILE, report); } catch {}
  }

  // Process each card sequentially
  const startTime = Date.now();

  for (let ci = 0; ci < CARDS.length; ci++) {
    const card = CARDS[ci];

    // Skip already found cards
    if (foundCards.has(card.id)) {
      console.log(`  [${ci+1}/${CARDS.length}] ${card.id} — ALREADY FOUND, skipping`);
      continue;
    }

    if (shutdownRequested) break;

    console.log(`\n  [${ ci+1}/${CARDS.length}] Searching: ${card.id} (${card.names[0]})...`);

    let cardTested = 0;
    let cardFound = false;
    const gen = generateUrlsForCard(card, skipSet);

    // Process in batches
    while (!cardFound && !shutdownRequested) {
      const batch = [];
      for (let i = 0; i < CONCURRENCY; i++) {
        const next = gen.next();
        if (next.done) break;
        batch.push(next.value);
      }
      if (batch.length === 0) break;

      // Test batch in parallel
      const results = await Promise.all(batch.map(async (url) => {
        const size = await headCheck(url);
        return { url, size };
      }));

      cardTested += batch.length;
      totalTested += batch.length;

      // Check for hits
      for (const { url, size } of results) {
        if (size > 0) {
          console.log(`\n  >>> FOUND: ${card.id} -> ${url} (${(size/1024).toFixed(1)} KB) <<<\n`);

          const filename = url.split('/').pop().replace(/[?#].*/,'');
          const dest = path.join(OUT_DIR, `${card.id}_${filename}`);
          try {
            await downloadFile(url, dest);
            allFound.push({ cardId: card.id, url, filename, size, dest });
          } catch {
            allFound.push({ cardId: card.id, url, filename, size, dest: 'DOWNLOAD_FAILED' });
          }
          foundCards.add(card.id);
          cardFound = true;
          break;
        }
      }

      // Progress display
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = totalTested > 0 ? (totalTested / ((Date.now() - startTime) / 1000)).toFixed(0) : 0;
      process.stdout.write(
        `\r    ${card.id}: ${cardTested.toLocaleString()} URLs | ` +
        `Total: ${totalTested.toLocaleString()} | ${rate}/s | ` +
        `Found: ${allFound.length}/${CARDS.length} | ${Math.floor(elapsed/60)}m${elapsed%60}s   `
      );
    }

    if (!cardFound) {
      console.log(`\n    ${card.id}: NOT FOUND after ${cardTested.toLocaleString()} URLs`);
    }

    // Save after each card
    saveAll();
  }

  // Final save and report
  saveAll();

  console.log('\n\n' + '='.repeat(60));
  console.log(`  COMPLETE  |  ${totalTested.toLocaleString()} tested  |  ${allFound.length} found`);
  console.log('='.repeat(60));

  const missing = CARDS.filter(c => !foundCards.has(c.id));
  if (missing.length > 0) {
    console.log(`\n  Still missing (${missing.length}):`);
    for (const c of missing) console.log(`    ${c.id}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
