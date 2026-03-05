#!/usr/bin/env node
/**
 * brute15-corrected-mv.js  —  CORRECTED MV NUMBER IMAGE HUNTER
 *
 * 45000 concurrent workers, armed with corrected MV CDN number mapping:
 *
 *   Key discovery: MV cards on CDN use the R card number, NOT the MV number!
 *     KS-149-MV (Kiba)   → found as 113_M_Kiba   (KS-113-R number)
 *     KS-153-MV (Gaara)  → found as 120_M_Gaara   (KS-120-R number)
 *     KS-152-MV (Itachi) → found as 128_M_Itachi  (KS-128-R number)
 *     KS-104-MV (Tsunade) → found as 104_M_Tsunade
 *     KS-108-MV (Naruto) → found as 108_M_Naruto
 *     KS-133-MV (Naruto) → found as 133_M_Naruto_Ramen
 *
 *   Simple MV URLs work: {num}_M_{Name} (no title needed in most cases)
 *   Sakura MV: try both 135 and 109 (KS-109-R is Sakura R)
 *
 * Key innovations over brute14:
 *   - 45000 workers (3x more than brute14)
 *   - Full dedup against brute6-14 (~1.5M+ URLs)
 *   - Corrected MV number mapping (nums array support)
 *   - Prioritized simple no-title MV patterns
 *   - 15 remaining missing cards (down from 20)
 *   - Resumable with Ctrl+C progress save
 *
 * Usage:  node scripts/brute15-corrected-mv.js
 * Stop:   Ctrl+C (saves progress, resumable)
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ─── CONFIG ────────────────────────────────────────────────────────────────
const CONCURRENCY    = 45000;
const TIMEOUT_MS     = 4000;
const MIN_FILE_SIZE  = 4000;
const OUT_DIR        = path.join(__dirname, '..', 'newvisual');
const PROGRESS_FILE  = path.join(OUT_DIR, 'brute15_progress.json');
const REPORT_FILE    = path.join(OUT_DIR, 'brute15_report.txt');

const BASE = 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/';
const WIDTHS = ['-1920w', '-1280w', '-960w', '-640w'];
const EXTS   = ['.webp', '.jpg', '.png'];

const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 46000,
  maxFreeSockets: 6000,
  timeout: TIMEOUT_MS,
});

// ─── ANSI COLORS ───────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold:  '\x1b[1m',
  dim:   '\x1b[2m',
  red:   '\x1b[31m',
  green: '\x1b[32m',
  yellow:'\x1b[33m',
  blue:  '\x1b[34m',
  magenta:'\x1b[35m',
  cyan:  '\x1b[36m',
  white: '\x1b[37m',
  bgRed:  '\x1b[41m',
  bgGreen:'\x1b[42m',
  bgYellow:'\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta:'\x1b[45m',
  bgCyan: '\x1b[46m',
  clear: '\x1b[2J\x1b[H',
  up: (n) => `\x1b[${n}A`,
  clearLine: '\x1b[2K',
};

// ─── LOAD ALL PREVIOUSLY TESTED URLs ───────────────────────────────────────
function loadSkipSet() {
  const skipSet = new Set();
  const progressFiles = [
    'brute6_progress.json', 'brute7_progress.json', 'brute8_progress.json',
    'brute9_progress.json', 'brute10_progress.json', 'brute11_progress.json',
    'brute12_progress.json', 'brute13_progress.json', 'brute14_progress.json',
  ];

  let loaded = 0;
  for (const f of progressFiles) {
    try {
      const fp = path.join(OUT_DIR, f);
      if (!fs.existsSync(fp)) continue;
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
      const urls = data.testedUrls || data.tested || [];
      for (const u of urls) skipSet.add(u);
      loaded += urls.length;
    } catch { /* skip corrupted */ }
  }

  // Also skip URLs from our own previous progress
  try {
    const fp = PROGRESS_FILE;
    if (fs.existsSync(fp)) {
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
      if (data.testedUrls) {
        for (const u of data.testedUrls) skipSet.add(u);
        loaded += data.testedUrls.length;
      }
    }
  } catch {}

  return { skipSet, loaded };
}

// ─── ALL 61 CHARACTERS — for Legendary hunt ─────────────────────────────────
const ALL_CHARACTERS = [
  { name: 'Naruto', variants: ['Naruto', 'Naruto_Uzumaki', 'NarutoUzumaki', 'Uzumaki'] },
  { name: 'Sasuke', variants: ['Sasuke', 'Sasuke_Uchiha', 'Sasuke_Uchiwa', 'SasukeUchiha', 'SasukeUchiwa', 'Uchiha', 'Uchiwa'] },
  { name: 'Sakura', variants: ['Sakura', 'Sakura_Haruno', 'SakuraHaruno', 'Haruno'] },
  { name: 'Kakashi', variants: ['Kakashi', 'Kakashi_Hatake', 'KakashiHatake', 'Hatake'] },
  { name: 'Itachi', variants: ['Itachi', 'Itachi_Uchiha', 'Itachi_Uchiwa', 'ItachiUchiha', 'ItachiUchiwa'] },
  { name: 'Gaara', variants: ['Gaara', 'Sabaku_no_Gaara'] },
  { name: 'Tsunade', variants: ['Tsunade'] },
  { name: 'Jiraiya', variants: ['Jiraiya', 'Jiraya'] },
  { name: 'Orochimaru', variants: ['Orochimaru'] },
  { name: 'Hinata', variants: ['Hinata', 'Hinata_Hyuga', 'Hinata_Hyuuga', 'HinataHyuga'] },
  { name: 'Shikamaru', variants: ['Shikamaru', 'Shikamaru_Nara', 'ShikamaruNara', 'Nara'] },
  { name: 'Rock Lee', variants: ['RockLee', 'Rock_Lee', 'Lee'] },
  { name: 'Neji', variants: ['Neji', 'Neji_Hyuga', 'NejiHyuga', 'Hyuga'] },
  { name: 'Kiba', variants: ['Kiba', 'Kiba_Inuzuka', 'KibaInuzuka', 'Inuzuka'] },
  { name: 'Shino', variants: ['Shino', 'Shino_Aburame', 'ShinoAburame', 'Aburame'] },
  { name: 'Temari', variants: ['Temari'] },
  { name: 'Kankuro', variants: ['Kankuro', 'Kankurou'] },
  { name: 'Zabuza', variants: ['Zabuza', 'Zabuza_Momochi', 'ZabuzaMomochi'] },
  { name: 'Haku', variants: ['Haku'] },
  { name: 'Kisame', variants: ['Kisame', 'Kisame_Hoshigaki', 'KisameHoshigaki'] },
  { name: 'Kabuto', variants: ['Kabuto', 'Kabuto_Yakushi', 'KabutoYakushi'] },
  { name: 'Kimimaro', variants: ['Kimimaro'] },
  { name: 'Tayuya', variants: ['Tayuya'] },
  { name: 'Sakon', variants: ['Sakon', 'Sakon_Ukon', 'SakonUkon'] },
  { name: 'Ukon', variants: ['Ukon'] },
  { name: 'Jirobo', variants: ['Jirobo', 'Jiroubou', 'Jirobou'] },
  { name: 'Kidomaru', variants: ['Kidomaru', 'Kidoumaru'] },
  { name: 'Dosu', variants: ['Dosu', 'Dosu_Kinuta', 'DosuKinuta'] },
  { name: 'Zaku', variants: ['Zaku', 'Zaku_Abumi', 'ZakuAbumi'] },
  { name: 'Kin', variants: ['Kin', 'Kin_Tsuchi', 'KinTsuchi'] },
  { name: 'Asuma', variants: ['Asuma', 'Asuma_Sarutobi', 'AsumaSarutobi'] },
  { name: 'Kurenai', variants: ['Kurenai', 'Yuhi_Kurenai', 'YuhiKurenai'] },
  { name: 'MightGuy', variants: ['MightGuy', 'Might_Guy', 'Guy', 'Gai', 'Gai_Maito', 'GaiMaito'] },
  { name: 'Tenten', variants: ['Tenten', 'Ten_Ten'] },
  { name: 'Choji', variants: ['Choji', 'Choji_Akimichi', 'ChojiAkimichi', 'Chouji'] },
  { name: 'Ino', variants: ['Ino', 'Ino_Yamanaka', 'InoYamanaka'] },
  { name: 'Hiruzen', variants: ['Hiruzen', 'Hiruzen_Sarutobi', 'HiruzenSarutobi', 'Sarutobi'] },
  { name: 'Shizune', variants: ['Shizune'] },
  { name: 'Anko', variants: ['Anko', 'Anko_Mitarashi', 'AnkoMitarashi', 'Mitarashi'] },
  { name: 'Ebisu', variants: ['Ebisu'] },
  { name: 'Iruka', variants: ['Iruka', 'Iruka_Umino', 'IrukaUmino'] },
  { name: 'Hayate', variants: ['Hayate', 'Hayate_Gekko', 'HayateGekko'] },
  { name: 'Genma', variants: ['Genma', 'Genma_Shiranui', 'GenmaShiranui'] },
  { name: 'Baki', variants: ['Baki'] },
  { name: 'Yashamaru', variants: ['Yashamaru'] },
  { name: 'Pakkun', variants: ['Pakkun'] },
  { name: 'Akamaru', variants: ['Akamaru'] },
  { name: 'Gamabunta', variants: ['Gamabunta', 'Gama_Bunta', 'GamaBunta'] },
  { name: 'Gamahiro', variants: ['Gamahiro'] },
  { name: 'Gamakichi', variants: ['Gamakichi', 'Gamakitchi'] },
  { name: 'Gamatatsu', variants: ['Gamatatsu'] },
  { name: 'Katsuyu', variants: ['Katsuyu'] },
  { name: 'TonTon', variants: ['TonTon', 'Ton_Ton'] },
  { name: 'Ninja Hound', variants: ['Ninja_Hound', 'Ninja_Hounds', 'NinjaHound'] },
  { name: 'Kyubi', variants: ['Kyubi', 'Kyuubi', 'Nine-Tails', 'Nine_Tails', 'NineTails', 'Kurama'] },
  { name: 'Ichibi', variants: ['Ichibi', 'One-Tail', 'One_Tail', 'OneTail', 'Shukaku'] },
  { name: 'Manda', variants: ['Manda'] },
  { name: 'Rasa', variants: ['Rasa'] },
  { name: 'Doki', variants: ['Doki'] },
  { name: 'Kyodaigumo', variants: ['Kyodaigumo', 'Giant_Spider'] },
  { name: 'Rempart', variants: ['Rempart', 'Rashomon'] },
];

// ─── LEGENDARY TITLES ─────────────────────────────────────────────────────
const LEGENDARY_TITLES = [
  '', 'Hokage', 'Sage', 'Sage_Mode', 'Bijuu_Mode', 'Kyubi_Mode', 'Tailed_Beast',
  'Rasengan', 'Shadow_Clone', 'Nine_Tails', 'Fox_Cloak', 'Baryon_Mode',
  'Six_Paths', 'Talk_no_Jutsu', 'Believe_It', 'Hero', 'Child_of_Prophecy',
  'Jinchuriki', 'Jinchuuriki', 'Ultimate', 'Final_Form', 'Awakened',
  'God', 'Legend', 'Legendary', 'Gold', 'Golden', 'Shining',
  'Supreme', 'Eternal', 'Infinite', 'Divine', 'Celestial',
  'Chidori', 'Sharingan', 'Mangekyo', 'Susanoo', 'Amaterasu',
  'Lightning_Blade', 'Copy_Ninja', 'Thousand_Jutsu',
  'Rasenshuriken', 'Wind_Release', 'Sage_Art',
  'Sand_Coffin', 'Sand_Burial', 'Kazekage', 'Ultimate_Defense',
  'Byakugan', 'Gentle_Fist', 'Eight_Trigrams', 'Palm_Rotation',
  'Hidden_Lotus', 'Eight_Gates', 'Gate_of_Death', 'Night_Guy',
  'Mind_Transfer', 'Shadow_Possession', 'Expansion',
  'Summoning', 'Toad_Sage', 'Snake_Sage', 'Slug_Sage',
  'Reanimation', 'Edo_Tensei', 'Transference',
  'Medical', 'Hundred_Healings', 'Creation_Rebirth',
  'Kubikiriboucho', 'Silent_Killing', 'Demon',
  'Crystal_Ice_Mirrors', 'Ice_Release', 'Kekkei_Genkai',
  'Tsukuyomi', 'Genjutsu', 'Massacre',
  'Samehada', 'Water_Prison', 'Shark',
  'Spider_War_Bow', 'Demon_Flute', 'Earth_Dome',
  'Curse_Mark', 'Cursed_Seal', 'Sound_Five',
  'Puppet_Master', 'Iron_Maiden', 'Wind_Scythe',
  'Parasitic_Insects', 'Bug_Swarm', 'Insect_Wall',
  'Fang_Over_Fang', 'Man_Beast_Clone', 'Two_Headed_Wolf',
  'Weapon_Specialist', 'Rising_Twin_Dragons',
  'Trench_Knives', 'Fire_Release', 'Will_of_Fire',
  'Tree_Bind', 'Demonic_Illusion', 'Genjutsu_Master',
  'Professor', 'Dead_Demon', 'Reaper_Death_Seal',
  'Reserve_Seal', 'Strength_of_a_Hundred',
  'Konoha', 'Leaf_Village', 'Sand_Village', 'Sound_Village',
  'Akatsuki', 'Rogue_Ninja', 'Missing_Nin',
  'Champion', 'Victor', 'Conqueror', 'Destroyer',
  'Protector', 'Savior', 'Avenger', 'Survivor',
  'Ramen', 'Ichiraku', 'Believe',
];

// ─── NEW PATTERN INTELLIGENCE ──────────────────────────────────────────────
// These functions generate title mutations based on CDN pattern discoveries.

/**
 * Reverse word order in a title.
 * e.g., "Insect_Wall" → "Wall_Insects", "Spider_Web" → "Web_Spider"
 * Discovery: 115_R_Shino_Wall_Insects (not Insect_Wall!)
 */
function reverseWords(title) {
  const parts = title.split('_');
  if (parts.length < 2) return [];
  const reversed = [...parts].reverse().join('_');
  if (reversed === title) return [];
  return [reversed];
}

/**
 * Capitalize the last letter of each word.
 * e.g., "Four" → "FouR", "Palms" → "PalmS", "Fist" → "FisT"
 * Discovery: 116_R_ART_Neji_Sixty-FouR_Palms
 */
function capsLastLetter(word) {
  if (word.length < 3) return [];
  const variants = [];
  // Capitalize last letter
  const v1 = word.slice(0, -1) + word.slice(-1).toUpperCase();
  if (v1 !== word) variants.push(v1);
  // Capitalize last 2 letters
  if (word.length >= 4) {
    const v2 = word.slice(0, -2) + word.slice(-2).toUpperCase();
    if (v2 !== word) variants.push(v2);
  }
  return variants;
}

/**
 * Generate all capitalization variants for a multi-word title.
 * Applies capsLastLetter to each word in the title independently.
 */
function titleCapsVariants(title) {
  const parts = title.split('_');
  if (parts.length === 0) return [];

  const variants = new Set();

  // Apply caps to each word independently
  for (let i = 0; i < parts.length; i++) {
    const wordVariants = capsLastLetter(parts[i]);
    for (const wv of wordVariants) {
      const newParts = [...parts];
      newParts[i] = wv;
      variants.add(newParts.join('_'));
    }
  }

  // Apply caps to ALL words simultaneously
  if (parts.length >= 2) {
    const allCaps = parts.map(p => {
      const cv = capsLastLetter(p);
      return cv.length > 0 ? cv[0] : p;
    });
    variants.add(allCaps.join('_'));
  }

  return [...variants];
}

/**
 * Generate hyphenated compound variants.
 * e.g., "Sixty_Four" → "Sixty-Four", "Sixty-FouR"
 * Discovery: 116_R_ART_Neji_Sixty-FouR_Palms
 */
function hyphenatedVariants(title) {
  const parts = title.split('_');
  if (parts.length < 2) return [];

  const variants = new Set();

  // Join adjacent pairs with hyphen instead of underscore
  for (let i = 0; i < parts.length - 1; i++) {
    const merged = parts[i] + '-' + parts[i + 1];
    const newParts = [...parts.slice(0, i), merged, ...parts.slice(i + 2)];
    variants.add(newParts.join('_'));

    // Also with caps on the hyphenated second word
    const mergedCaps = capsLastLetter(parts[i + 1]);
    for (const mc of mergedCaps) {
      const newParts2 = [...parts.slice(0, i), parts[i] + '-' + mc, ...parts.slice(i + 2)];
      variants.add(newParts2.join('_'));
    }
  }

  return [...variants];
}

/**
 * Add plural/singular variants
 * e.g., "Insect" → "Insects", "Insects" → "Insect"
 */
function pluralVariants(title) {
  const parts = title.split('_');
  const variants = new Set();

  for (let i = 0; i < parts.length; i++) {
    const w = parts[i];
    const newParts = [...parts];
    if (w.endsWith('s') && w.length > 3) {
      newParts[i] = w.slice(0, -1); // Remove trailing s
    } else if (!w.endsWith('s') && w.length > 2) {
      newParts[i] = w + 's'; // Add trailing s
    } else {
      continue;
    }
    variants.add(newParts.join('_'));
  }

  return [...variants];
}

// ─── MISSING CARDS DEFINITIONS ─────────────────────────────────────────────
// Updated for brute15: removed 5 found MV cards (149, 150, 151, 152, 153)
// MV cards now use corrected CDN numbers via `nums` array
const MISSING_CARDS = [
  // ── UC ───────────────────────────────────────────────────────────────────
  {
    id: 'KS-045-UC', num: 45, category: 'UC',
    names: ['Anko', 'Anko_Mitarashi', 'AnkoMitarashi', 'Mitarashi'],
    rarities: ['UC', 'Uncommon'],
    titles: [
      'Shadow_Snake', 'Shadow_Snake_Hands', 'Snake_Hands',
      'Striking_Shadow_Snake', 'Striking_Shadow', 'Hidden_Snake',
      'Senei_Jashu', 'Senei_Ta_Jashu', 'Senei',
      'Examiner', 'Special_Jonin', 'Forest_Death',
      'Proctor', 'Undercover', 'Assassin', 'Jonin',
      'Snake_Strike', 'Serpent_Strike', 'Shadow_Serpent',
      'Twin_Snake', 'Hidden_Shadow_Snake', 'Snake_Authority',
      'Snake_Shadow', 'Viper', 'Cobra', 'Serpent',
      'Shadow_Snake_Hand', 'Striking_Snake',
      'Many_Hidden_Shadow_Snake', 'Dual_Snake',
      'Forbidden_Jutsu', 'Curse_Seal', 'Snake_Summoning',
      'Snake_Fang', 'Venom', 'Poison', 'Toxic', 'Deadly',
      // Reversed word combos
      'Snake_Shadow_Hands', 'Hands_Snake_Shadow',
      'Snake_Striking', 'Snake_Hidden',
    ],
  },

  // ── R cards ──────────────────────────────────────────────────────────────
  {
    id: 'KS-115-RA', num: 115, category: 'RA',
    names: ['Shino', 'Shino_Aburame', 'ShinoAburame', 'Aburame'],
    rarities: ['R_ART'],
    titles: [
      'Insect_Swarm', 'Bug_Swarm', 'Parasitic_Insects', 'Kikaichuu',
      'Kikaichu', 'Insect_Wall', 'Bug_Wall', 'Bug_Barrier',
      'Insect_Clone', 'Bug_Clone', 'Insect_Sphere', 'Bug_Sphere',
      'Secret_Technique', 'Insect_Cocoon', 'Insect_Gathering',
      'Destruction_Bug', 'Human_Bug_Clone', 'Spindle_Formation',
      'Insect_Shield', 'Bug_Tornado', 'Swarm', 'Beetle',
      // Reversed word order (like 115_R was found as Wall_Insects)
      'Wall_Insects', 'Wall_Insect', 'Wall_Bug', 'Swarm_Insect',
      'Swarm_Bug', 'Shield_Insect', 'Shield_Bug', 'Clone_Insect',
      'Sphere_Bug', 'Barrier_Bug', 'Tornado_Bug',
      'Gathering_Insect', 'Rain_Insect', 'Cocoon_Insect',
    ],
  },
  {
    id: 'KS-122-R', num: 122, category: 'R',
    names: ['Jirobo', 'Jiroubou', 'Jirobou'],
    rarities: ['R'],
    titles: [
      'Earth_Dome', 'Earth_Mausoleum', 'Sphere_Graves',
      'Earth_Release', 'Earth_Wall', 'Doton',
      'Curse_Mark', 'Cursed_Seal', 'Second_State',
      'Level_2', 'Stage_2', 'Transformed',
      'Earth_Rising_Stone', 'Rock_Fist', 'Stone_Fist',
      'Earth_Golem', 'Barrier', 'Devouring',
      'Earth_Prison', 'Earth_Cage', 'Earth_Bind',
      'Sound_Four', 'Bearer', 'Guardian',
      'Chakra_Absorption', 'Absorb', 'Drain',
      // Reversed
      'Dome_Earth', 'Wall_Earth', 'Fist_Rock', 'Fist_Stone',
      'Golem_Earth', 'Prison_Earth', 'Cage_Earth',
      'Absorption_Chakra', 'Graves_Sphere', 'Stone_Rising_Earth',
    ],
  },
  {
    id: 'KS-122-RA', num: 122, category: 'RA',
    names: ['Jirobo', 'Jiroubou', 'Jirobou'],
    rarities: ['R_ART'],
    titles: [
      'Earth_Dome', 'Earth_Mausoleum', 'Sphere_Graves',
      'Curse_Mark', 'Cursed_Seal', 'Second_State',
      'Earth_Rising_Stone', 'Rock_Fist', 'Earth_Golem',
      'Barrier', 'Devouring', 'Earth_Prison', 'Absorb',
      // Reversed
      'Dome_Earth', 'Fist_Rock', 'Golem_Earth', 'Prison_Earth',
      'Graves_Sphere', 'Stone_Rising_Earth',
    ],
  },
  {
    id: 'KS-124-R', num: 124, category: 'R',
    names: ['Kidomaru', 'Kidoumaru'],
    rarities: ['R'],
    titles: [
      'Spider_Web', 'Spider_War_Bow', 'Spider_Bow',
      'Spider_Sticky_Gold', 'Sticky_Gold', 'Golden_Spider',
      'Curse_Mark', 'Cursed_Seal', 'Second_State',
      'Level_2', 'Six_Arms', 'Third_Eye',
      'Spider_Thread', 'Spider_Net', 'Web',
      'Kumoshibari', 'Kumo', 'Spider',
      'Spider_Bind', 'Cocoon', 'Spider_Cocoon',
      'Arrow', 'Spider_Arrow', 'War_Bow',
      'Bearer', 'Sound_Four',
      'Spider_Rain', 'Gold_Thread', 'Armor',
      // Reversed
      'Web_Spider', 'Bow_Spider', 'Bow_War_Spider', 'Gold_Sticky_Spider',
      'Thread_Spider', 'Net_Spider', 'Arrow_Spider', 'Bind_Spider',
      'Rain_Spider', 'Thread_Gold', 'Cocoon_Spider',
      'Arms_Six', 'Eye_Third',
    ],
  },
  {
    id: 'KS-124-RA', num: 124, category: 'RA',
    names: ['Kidomaru', 'Kidoumaru'],
    rarities: ['R_ART'],
    titles: [
      'Spider_Web', 'Spider_War_Bow', 'Spider_Bow',
      'Spider_Sticky_Gold', 'Sticky_Gold', 'Golden_Spider',
      'Curse_Mark', 'Cursed_Seal', 'Second_State',
      'Six_Arms', 'Third_Eye', 'Spider_Thread',
      'Spider_Bind', 'Cocoon', 'Arrow', 'War_Bow',
      // Reversed
      'Web_Spider', 'Bow_Spider', 'Thread_Spider', 'Bind_Spider',
      'Arms_Six', 'Eye_Third', 'Bow_War',
    ],
  },
  {
    id: 'KS-126-R', num: 126, category: 'R',
    names: ['Orochimaru', 'OROCHIMARU'],
    rarities: ['R'],
    titles: [
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
      'Transference_Ritual', 'Body_Snatch', 'Immortal',
      'Oral_Rebirth', 'Rebirth', 'Snake_Clone',
      // Reversed
      'Tensei_Edo', 'World_Impure', 'Transfer_Body',
      'Serpent_Headed_Eight', 'Snake_White', 'Cutter_Grass',
      'Sage_Snake', 'Seal_Pronged_Five', 'Mark_Curse',
      'Clone_Shadow', 'Release_Wind', 'Shadow_Hidden',
      'Ritual_Transference', 'Snatch_Body', 'Clone_Snake',
    ],
  },
  {
    id: 'KS-127-R', num: 127, category: 'R',
    names: ['Sakon', 'Sakon_Ukon', 'SakonUkon', 'Ukon'],
    rarities: ['R'],
    titles: [
      'Black_Seal', 'Curse_Mark', 'Cursed_Seal', 'Second_State',
      'Level_2', 'Demon_Twins', 'Twin_Demon',
      'Parasite', 'Parasitic_Demon', 'Body_Fusion',
      'Multiple_Fists', 'Barrage', 'Demolishing_Fist',
      'Ukon_Fusion', 'Twin', 'Brothers',
      'Rashomon', 'Summoning_Rashomon',
      'Sound_Four', 'Bearer', 'Cell',
      'Molecular_Possession', 'Possession',
      'Combination', 'Merge', 'Fusion',
      // Reversed
      'Seal_Black', 'Mark_Curse', 'Twins_Demon', 'Demon_Twin',
      'Fusion_Body', 'Fists_Multiple', 'Fist_Demolishing',
      'Fusion_Ukon', 'Rashomon_Summoning',
      'Possession_Molecular',
    ],
  },
  {
    id: 'KS-127-RA', num: 127, category: 'RA',
    names: ['Sakon', 'Sakon_Ukon', 'SakonUkon', 'Ukon'],
    rarities: ['R_ART'],
    titles: [
      'Black_Seal', 'Curse_Mark', 'Cursed_Seal', 'Second_State',
      'Demon_Twins', 'Twin_Demon', 'Parasite',
      'Multiple_Fists', 'Barrage', 'Demolishing_Fist',
      'Ukon_Fusion', 'Rashomon', 'Molecular_Possession',
      // Reversed
      'Seal_Black', 'Twins_Demon', 'Fists_Multiple',
      'Fist_Demolishing', 'Fusion_Ukon', 'Possession_Molecular',
    ],
  },
  {
    id: 'KS-129-R', num: 129, category: 'R',
    names: ['Kyubi', 'Kyuubi', 'Nine-Tails', 'Nine_Tails', 'NineTails', 'Kurama', 'Nine-Tail', 'Nine_Tail'],
    rarities: ['R'],
    titles: [
      'Partial_Trasformation', 'Partial_Transformation',
      'Trasformation', 'Transformation',
      'Chakra_Cloak', 'Chakra_Shroud', 'Cloak',
      'Rage', 'Rampage', 'Berserk', 'Unleashed',
      'Jinchuriki', 'Jinchuuriki', 'Beast', 'Fox',
      'Demon_Fox', 'Fox_Cloak', 'Fox_Spirit',
      'Nine_Tails_Cloak', 'Bijuu_Cloak', 'Tailed_Beast',
      'Menacing_Ball', 'Tailed_Beast_Ball',
      'Red_Chakra', 'Chakra_Mode',
      'Full_Trasformation', 'Full_Transformation',
      'Awakening', 'Release', 'Fury',
      // Reversed
      'Cloak_Chakra', 'Shroud_Chakra', 'Fox_Demon',
      'Cloak_Fox', 'Spirit_Fox', 'Cloak_Nine_Tails',
      'Beast_Tailed', 'Ball_Menacing', 'Ball_Tailed_Beast',
      'Chakra_Red', 'Mode_Chakra',
    ],
  },
  {
    id: 'KS-129-RA', num: 129, category: 'RA',
    names: ['Kyubi', 'Kyuubi', 'Nine-Tails', 'Nine_Tails', 'NineTails', 'Kurama'],
    rarities: ['R_ART'],
    titles: [
      'Partial_Trasformation', 'Partial_Transformation',
      'Chakra_Cloak', 'Chakra_Shroud', 'Cloak',
      'Rage', 'Rampage', 'Berserk', 'Unleashed',
      'Jinchuriki', 'Demon_Fox', 'Fox_Cloak',
      'Nine_Tails_Cloak', 'Tailed_Beast', 'Menacing_Ball',
      'Full_Trasformation', 'Full_Transformation',
      // Reversed
      'Cloak_Chakra', 'Fox_Demon', 'Cloak_Fox',
      'Cloak_Nine_Tails', 'Beast_Tailed', 'Ball_Menacing',
    ],
  },
  {
    id: 'KS-130-R', num: 130, category: 'R',
    names: ['One-Tail', 'One_Tail', 'OneTail', 'Shukaku', 'Ichibi'],
    rarities: ['R'],
    titles: [
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
      'Jinchuriki', 'Sand_Shield', 'Sand',
      'Rage', 'Rampage', 'Fury',
      // Reversed
      'Storm_Sand', 'Burial_Sand', 'Release_Wind',
      'Bullets_Air', 'Bullets_Wind', 'Beast_Tailed',
      'Ball_Tailed_Beast', 'Ball_Menacing', 'Shield_Sand',
    ],
  },

  // ── Secret ────────────────────────────────────────────────────────────────
  {
    id: 'KS-134-S', num: 134, category: 'S',
    names: ['Kyubi', 'Kyuubi', 'Nine-Tails', 'Nine_Tails', 'NineTails', 'Kurama', 'Nine-Tail', 'Nine_Tail'],
    rarities: ['Secret_GOLD', 'SecretV_GOLD', 'Secret', 'SecretV', 'S', 'S_GOLD'],
    titles: [
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
      'Fury', 'Wrath', 'Power', 'Overwhelming',
      // Reversed
      'Cloak_Nine_Tails', 'Cloak_Chakra', 'Cloak_Fox',
      'Fox_Demon', 'Beast_Tailed', 'Ball_Menacing',
      'Ball_Tailed_Beast', 'Chakra_Red', 'Mode_Chakra',
      'Mode_Beast', 'Spirit_Fox', 'Tails_Nine',
    ],
  },

  // ── Mythos V (MV) — CORRECTED CDN NUMBERS ────────────────────────────────
  {
    id: 'KS-135-MV', nums: [135, 109], category: 'MV',  // TRY BOTH NUMBERS!
    names: ['Sakura', 'Sakura_Haruno', 'SakuraHaruno', 'Haruno'],
    rarities: ['M'],
    titles: [
      'Medical', 'Medical_Ninja', 'Healing', 'Recovery',
      'Recovery_Team', 'Cherry_Blossom', 'Inner_Sakura',
      'Strength', 'Super_Strength', 'Punch', 'Hundred_Healings',
      'Byakugou', 'Yin_Seal', 'Summoning_Katsuyu', 'Team_7',
      // reversed
      'Ninja_Medical', 'Team_Recovery', 'Blossom_Cherry',
      'Sakura_Inner', 'Strength_Super', 'Healings_Hundred',
      'Seal_Yin', 'Katsuyu_Summoning',
    ],
  },
  {
    id: 'KS-136-MV', nums: [136], category: 'MV',
    names: ['Sasuke', 'Sasuke_Uchiha', 'Sasuke_Uchiwa', 'SasukeUchiha', 'SasukeUchiwa'],
    rarities: ['M'],
    titles: [
      'Heaven_Curse_Mark', 'Curse_Mark', 'Cursed_Seal',
      'Chidori', 'Lightning_Blade', 'Sharingan',
      'Lion_Combo', 'Phoenix_Flower', 'Fireball',
      'Avenger', 'Last_Uchiha', 'Mangekyo', 'Hawk',
      // reversed
      'Mark_Curse_Heaven', 'Mark_Curse', 'Seal_Cursed',
      'Blade_Lightning', 'Combo_Lion', 'Flower_Phoenix',
      'Uchiha_Last',
    ],
  },
];

// ─── URL GENERATOR — MASSIVELY EXPANDED ────────────────────────────────────

function* generateUrlsForCard(card, skipSet) {
  // Support `nums` array (for MV cards with corrected CDN numbers) or fall back to `[card.num]`
  const baseNums = card.nums || [card.num];
  const allNums = [];
  for (const bn of baseNums) {
    allNums.push(String(bn), String(bn).padStart(2, '0'), String(bn).padStart(3, '0'));
  }

  const isMV = card.category === 'MV';

  // Collect all title variants: original + reversed + caps + hyphenated + plural
  const allTitles = new Set(card.titles);
  for (const t of card.titles) {
    for (const r of reverseWords(t))     allTitles.add(r);
    for (const c of titleCapsVariants(t)) allTitles.add(c);
    for (const h of hyphenatedVariants(t)) allTitles.add(h);
    for (const p of pluralVariants(t))    allTitles.add(p);
    // Reversed + caps combo
    for (const r of reverseWords(t)) {
      for (const c of titleCapsVariants(r)) allTitles.add(c);
      for (const h of hyphenatedVariants(r)) allTitles.add(h);
    }
  }
  const titleArray = [...allTitles];

  // For MV cards: prioritize simple no-title patterns first (most MV URLs are simple)
  if (isMV) {
    for (const n of allNums) {
      for (const r of card.rarities) {
        for (const name of card.names) {
          // Pattern MV-PRIORITY: {num}_{rarity}_{name} — NO TITLE (like 104_M_Tsunade, 113_M_Kiba)
          for (const w of WIDTHS) {
            for (const ext of EXTS) {
              const url = `${BASE}${n}_${r}_${name}${w}${ext}`;
              if (!skipSet.has(url)) yield url;
              // With trailing underscore
              const url2 = `${BASE}${n}_${r}_${name}_${w}${ext}`;
              if (!skipSet.has(url2)) yield url2;
            }
          }
        }
      }
    }
  }

  for (const n of allNums) {
    for (const r of card.rarities) {
      for (const name of card.names) {
        // Pattern A: {num}_{rarity}_{name}_{title}-{width}.{ext}
        // For MV cards, limit title variants since simple URLs work
        const titlesToUse = isMV ? card.titles : titleArray;
        for (const title of titlesToUse) {
          for (const w of WIDTHS) {
            for (const ext of EXTS) {
              const url = `${BASE}${n}_${r}_${name}_${title}${w}${ext}`;
              if (!skipSet.has(url)) yield url;
            }
          }
        }

        // Pattern B: Name only — NO TITLE (already done for MV above, still do for non-MV)
        if (!isMV) {
          for (const w of WIDTHS) {
            for (const ext of EXTS) {
              const url = `${BASE}${n}_${r}_${name}${w}${ext}`;
              if (!skipSet.has(url)) yield url;
              // With trailing underscore
              const url2 = `${BASE}${n}_${r}_${name}_${w}${ext}`;
              if (!skipSet.has(url2)) yield url2;
            }
          }
        }

        // Pattern C: Hyphen between name-title
        const patternCTitles = isMV ? card.titles.slice(0, 10) : titleArray.slice(0, 30);
        for (const title of patternCTitles) {
          for (const ext of EXTS) {
            const url = `${BASE}${n}_${r}_${name}-${title}-1920w${ext}`;
            if (!skipSet.has(url)) yield url;
          }
        }

        // Pattern D: All-hyphen titles
        const patternDTitles = isMV ? card.titles.slice(0, 10) : titleArray.slice(0, 30);
        for (const title of patternDTitles) {
          const titleH = title.replace(/_/g, '-');
          if (titleH !== title) {
            for (const ext of EXTS) {
              const url = `${BASE}${n}_${r}_${name}_${titleH}-1920w${ext}`;
              if (!skipSet.has(url)) yield url;
            }
          }
        }

        // Pattern E: Lowercase variants (like Gentle_fist)
        const patternETitles = isMV ? card.titles.slice(0, 10) : titleArray.slice(0, 30);
        for (const title of patternETitles) {
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

  // Pattern F: No rarity prefix (num_name_title) — use first baseNum only
  const primaryNum = baseNums[0];
  for (const name of card.names.slice(0, 2)) {
    const patternFTitles = isMV ? card.titles.slice(0, 10) : titleArray.slice(0, 30);
    for (const title of patternFTitles) {
      const url = `${BASE}${primaryNum}_${name}_${title}-1920w.webp`;
      if (!skipSet.has(url)) yield url;
    }
    // No title, no rarity
    const url = `${BASE}${primaryNum}_${name}-1920w.webp`;
    if (!skipSet.has(url)) yield url;
  }

  // Pattern G: CDN typos — drop/double/swap letters in title words (skip for MV)
  if (!isMV) {
    for (const r of card.rarities.slice(0, 3)) {
      for (const name of card.names.slice(0, 2)) {
        for (const title of card.titles.slice(0, 15)) {
          const parts = title.split('_');
          for (let i = 0; i < parts.length; i++) {
            if (parts[i].length < 4) continue;
            // Drop a letter
            for (let j = 1; j < parts[i].length - 1; j++) {
              const typo = parts[i].slice(0, j) + parts[i].slice(j + 1);
              const newParts = [...parts]; newParts[i] = typo;
              const url = `${BASE}${primaryNum}_${r}_${name}_${newParts.join('_')}-1920w.webp`;
              if (!skipSet.has(url)) yield url;
            }
            // Double a letter
            for (let j = 0; j < parts[i].length; j++) {
              const typo = parts[i].slice(0, j) + parts[i][j] + parts[i].slice(j);
              const newParts = [...parts]; newParts[i] = typo;
              const url = `${BASE}${primaryNum}_${r}_${name}_${newParts.join('_')}-1920w.webp`;
              if (!skipSet.has(url)) yield url;
            }
            // Swap adjacent letters
            for (let j = 0; j < parts[i].length - 1; j++) {
              const arr = parts[i].split('');
              [arr[j], arr[j+1]] = [arr[j+1], arr[j]];
              const typo = arr.join('');
              const newParts = [...parts]; newParts[i] = typo;
              const url = `${BASE}${primaryNum}_${r}_${name}_${newParts.join('_')}-1920w.webp`;
              if (!skipSet.has(url)) yield url;
            }
          }
        }
      }
    }
  }

  // Pattern H: French title variants (accent-free) — skip for MV
  if (!isMV) {
    const frenchTitles = [];
    for (const title of card.titles) {
      // Convert English title to possible French equivalent
      const fr = title
        .replace('Shadow', 'Ombre')
        .replace('Snake', 'Serpent')
        .replace('Earth', 'Terre')
        .replace('Spider', 'Araignee')
        .replace('Seal', 'Sceau')
        .replace('Curse', 'Malediction')
        .replace('Sand', 'Sable')
        .replace('Wind', 'Vent')
        .replace('Fire', 'Feu')
        .replace('Water', 'Eau')
        .replace('Lightning', 'Foudre')
        .replace('Clone', 'Clone')
        .replace('Fist', 'Poing')
        .replace('Wall', 'Mur')
        .replace('Shield', 'Bouclier')
        .replace('Demon', 'Demon')
        .replace('Beast', 'Bete');
      if (fr !== title) frenchTitles.push(fr);
    }
    for (const r of card.rarities.slice(0, 2)) {
      for (const name of card.names.slice(0, 2)) {
        for (const title of frenchTitles) {
          const url = `${BASE}${primaryNum}_${r}_${name}_${title}-1920w.webp`;
          if (!skipSet.has(url)) yield url;
        }
      }
    }
  }
}

// ─── LEGENDARY URL GENERATOR ───────────────────────────────────────────────

function* generateLegendaryUrls(skipSet) {
  const legendaryPrefixes = [
    'Legendary', 'LEGENDARY', 'L', 'Gold', 'GOLD',
    'Legendary_GOLD', 'GOLD_Legendary', 'Legend',
    '22K', 'Gold_22K', 'GOLD_22K',
  ];

  for (const char of ALL_CHARACTERS) {
    for (const nameVar of char.variants) {
      for (const prefix of legendaryPrefixes) {
        for (const title of LEGENDARY_TITLES) {
          for (const w of WIDTHS) {
            for (const ext of EXTS) {
              let url;
              if (title === '') {
                url = `${BASE}${prefix}_${nameVar}_${w}${ext}`;
                if (!skipSet.has(url)) yield { url, char: char.name, type: 'legendary' };
                url = `${BASE}${prefix}_${nameVar}${w}${ext}`;
                if (!skipSet.has(url)) yield { url, char: char.name, type: 'legendary' };
              } else {
                url = `${BASE}${prefix}_${nameVar}_${title}${w}${ext}`;
                if (!skipSet.has(url)) yield { url, char: char.name, type: 'legendary' };
                // Reversed title
                for (const rev of reverseWords(title)) {
                  url = `${BASE}${prefix}_${nameVar}_${rev}${w}${ext}`;
                  if (!skipSet.has(url)) yield { url, char: char.name, type: 'legendary' };
                }
              }
            }
          }
        }
        // With number prefixes (141-200 range)
        for (let num = 141; num <= 200; num++) {
          const url = `${BASE}${num}_${prefix}_${nameVar}-1920w.webp`;
          if (!skipSet.has(url)) yield { url, char: char.name, type: 'legendary' };
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

// ─── DASHBOARD ─────────────────────────────────────────────────────────────

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h${String(m).padStart(2,'0')}m${String(s).padStart(2,'0')}s`;
  return `${m}m${String(s).padStart(2,'0')}s`;
}

function progressBar(current, total, width = 30) {
  if (total === 0) return '[' + ' '.repeat(width) + ']';
  const pct = Math.min(current / total, 1);
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
  return `[${bar}]`;
}

function formatNum(n) {
  return n.toLocaleString();
}

function drawDashboard(stats) {
  const lines = [];
  const w = 80;
  const sep = C.dim + '\u2500'.repeat(w) + C.reset;

  lines.push('');
  lines.push(C.bold + C.magenta + '\u250C' + '\u2500'.repeat(w - 2) + '\u2510' + C.reset);
  lines.push(C.bold + C.magenta + '\u2502' + C.reset + C.bold + C.white + '  BRUTE15-CORRECTED-MV  '.padStart(w/2 + 11).padEnd(w - 2) + C.magenta + '\u2502' + C.reset);
  lines.push(C.bold + C.magenta + '\u2502' + C.reset + C.dim + '  45000-Worker Image Hunter with Corrected MV Numbers'.padEnd(w - 2) + C.magenta + '\u2502' + C.reset);
  lines.push(C.bold + C.magenta + '\u2502' + C.reset + C.dim + '  Pattern Intelligence: Reversed words, Random CAPS, Hyphens, M-prefix'.padEnd(w - 2) + C.magenta + '\u2502' + C.reset);
  lines.push(C.bold + C.magenta + '\u2514' + '\u2500'.repeat(w - 2) + '\u2518' + C.reset);
  lines.push('');

  // Global stats
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const rate = elapsed > 0 ? (stats.totalTested / elapsed).toFixed(0) : 0;
  const skipStr = formatNum(stats.skipCount);
  const testedStr = formatNum(stats.totalTested);
  const rateStr = `${rate}/s`;
  const totalUrlsStr = stats.totalUrlsEstimate > 0 ? formatNum(stats.totalUrlsEstimate) : '?';
  const overallPct = stats.totalUrlsEstimate > 0 ? ((stats.totalTested / stats.totalUrlsEstimate) * 100).toFixed(1) : '?';

  lines.push(C.bold + '  GLOBAL STATS' + C.reset);
  lines.push(sep);
  lines.push(`  ${C.dim}Elapsed:${C.reset}  ${formatTime(elapsed)}      ${C.dim}Rate:${C.reset}  ${C.bold}${C.cyan}${rateStr}${C.reset}      ${C.dim}Workers:${C.reset}  ${C.bold}${CONCURRENCY}${C.reset}`);
  lines.push(`  ${C.dim}Tested:${C.reset}  ${C.bold}${testedStr}${C.reset}      ${C.dim}Dedup:${C.reset}  ${skipStr}      ${C.dim}Errors:${C.reset}  ${stats.errors}`);
  if (stats.totalUrlsEstimate > 0) {
    const gBar = progressBar(stats.totalTested, stats.totalUrlsEstimate, 40);
    lines.push(`  ${C.dim}Overall:${C.reset} ${gBar} ${overallPct}% of ~${totalUrlsStr}`);
  }
  lines.push('');

  // Found cards
  lines.push(C.bold + C.green + `  FOUND: ${stats.found.length}` + C.reset);
  lines.push(sep);
  if (stats.found.length === 0) {
    lines.push(C.dim + '  (none yet)' + C.reset);
  } else {
    for (const f of stats.found) {
      const sizeKB = (f.size / 1024).toFixed(1);
      const icon = f.type === 'legendary' ? C.yellow + '\u2605' + C.reset : C.green + '\u2713' + C.reset;
      const name = f.cardId || f.char;
      const urlFile = f.url.split('/').pop().substring(0, 55);
      lines.push(`  ${icon} ${C.bold}${name.padEnd(14)}${C.reset} ${C.dim}${sizeKB.padStart(7)}KB${C.reset}  ${C.cyan}${urlFile}${C.reset}`);
    }
  }
  lines.push('');

  // Current phase & card
  const phaseLabel = stats.phase === 'missing' ? 'PHASE 1: MISSING CARDS' : 'PHASE 2: LEGENDARY HUNT';
  const phaseColor = stats.phase === 'missing' ? C.blue : C.yellow;
  lines.push(C.bold + phaseColor + `  ${phaseLabel}` + C.reset);
  lines.push(sep);

  if (stats.currentCard) {
    const cc = stats.currentCard;
    const pct = cc.totalUrls > 0 ? ((cc.tested / cc.totalUrls) * 100).toFixed(1) : '?';
    const bar = progressBar(cc.tested, cc.totalUrls, 40);
    const catColor = cc.category === 'legendary' ? C.yellow : cc.category === 'MV' ? C.magenta : cc.category === 'S' ? C.red : C.blue;
    lines.push(`  ${catColor}[${cc.category}]${C.reset} ${C.bold}${cc.id}${C.reset} - ${cc.name}`);
    lines.push(`  ${bar} ${pct}%  (${formatNum(cc.tested)} / ${cc.totalUrls > 0 ? formatNum(cc.totalUrls) : '?'})`);
    if (cc.tested > 0 && elapsed > 5) {
      const cardRate = cc.tested / Math.max(1, (Date.now() - (cc.startTime || stats.startTime)) / 1000);
      const remaining = cc.totalUrls - cc.tested;
      if (cardRate > 0 && remaining > 0) {
        const eta = remaining / cardRate;
        lines.push(`  ${C.dim}ETA this card: ${formatTime(eta)}${C.reset}`);
      }
    }
  } else if (stats.legendaryPhase) {
    const lp = stats.legendaryPhase;
    const lbar = progressBar(lp.tested, lp.totalEstimate, 40);
    lines.push(`  ${lbar} ${formatNum(lp.tested)} tested across ${ALL_CHARACTERS.length} characters`);
    if (lp.currentChar) {
      lines.push(`  ${C.dim}Current:${C.reset} ${lp.currentChar}`);
    }
  } else {
    lines.push(C.dim + '  (idle)' + C.reset);
  }
  lines.push('');

  // Missing cards grid
  lines.push(C.bold + `  MISSING CARDS: ${stats.missingCards.length} targets (${stats.missingCards.length - stats.foundIds.size} remaining)` + C.reset);
  lines.push(sep);
  const cols = 4;
  const colWidth = Math.floor((w - 4) / cols);
  for (let i = 0; i < stats.missingCards.length; i += cols) {
    let row = '  ';
    for (let j = 0; j < cols && i + j < stats.missingCards.length; j++) {
      const card = stats.missingCards[i + j];
      const found = stats.foundIds.has(card.id);
      const icon = found ? C.green + '\u2713' : C.red + '\u2717';
      const text = `${icon} ${card.id}${C.reset}`;
      row += text.padEnd(colWidth + 12);
    }
    lines.push(row);
  }
  lines.push('');

  // New patterns info
  lines.push(C.bold + '  PATTERN INTELLIGENCE (v15)' + C.reset);
  lines.push(sep);
  lines.push(`  ${C.cyan}\u25CF${C.reset} Reversed word order (Wall_Insects, Web_Spider, ...)`);
  lines.push(`  ${C.cyan}\u25CF${C.reset} Random CAPS last letter (FouR, PalmS, FisT, ...)`);
  lines.push(`  ${C.cyan}\u25CF${C.reset} Hyphenated compounds (Sixty-FouR, Eight-Trigrams, ...)`);
  lines.push(`  ${C.cyan}\u25CF${C.reset} MV cards use "M" prefix (not MV/MV_Special)`);
  lines.push(`  ${C.cyan}\u25CF${C.reset} No-title variants (num_rarity_name only)`);
  lines.push(`  ${C.cyan}\u25CF${C.reset} Plural/singular (Insect/Insects, Palm/Palms, ...)`);
  lines.push(`  ${C.cyan}\u25CF${C.reset} French title variants (Ombre, Serpent, Terre, ...)`);
  lines.push(`  ${C.cyan}\u25CF${C.reset} MV cards 149+ use R card numbers on CDN (113, 120, 128)`);
  lines.push(`  ${C.cyan}\u25CF${C.reset} Simple MV URLs work: {num}_M_{Name} (no title needed)`);
  lines.push(`  ${C.cyan}\u25CF${C.reset} Sakura MV: try both 135 and 109`);
  lines.push('');

  // Footer
  lines.push(C.dim + '  Press Ctrl+C to stop and save progress' + C.reset);
  lines.push('');

  process.stdout.write(C.clear);
  process.stdout.write(lines.join('\n'));
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Load skip set
  const { skipSet, loaded: skipLoaded } = loadSkipSet();

  // Load previous progress
  let foundCards = new Set();
  let totalTested = 0;
  const allFound = [];
  const testedInThisRun = [];
  try {
    const prev = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    if (prev.found) {
      for (const f of prev.found) {
        foundCards.add(f.cardId || f.char);
        allFound.push(f);
      }
    }
    if (prev.totalTested) totalTested = prev.totalTested;
  } catch {}

  // Estimate total URLs (rough)
  let totalUrlsEstimate = 0;
  for (const card of MISSING_CARDS) {
    if (foundCards.has(card.id)) continue;
    const numCount = card.nums ? card.nums.length * 3 : 3;
    const baseCount = card.names.length * card.rarities.length * card.titles.length * numCount;
    totalUrlsEstimate += baseCount * WIDTHS.length * EXTS.length * 3; // ~3x for mutations
  }
  totalUrlsEstimate += ALL_CHARACTERS.length * LEGENDARY_TITLES.length * 10 * WIDTHS.length * EXTS.length;

  const stats = {
    startTime: Date.now(),
    totalTested: totalTested,
    totalUrlsEstimate,
    skipCount: skipLoaded,
    errors: 0,
    found: [...allFound],
    foundIds: foundCards,
    missingCards: MISSING_CARDS,
    currentCard: null,
    legendaryPhase: null,
    phase: 'missing',
  };

  drawDashboard(stats);

  let shutdownRequested = false;
  process.on('SIGINT', () => {
    if (shutdownRequested) process.exit(1);
    shutdownRequested = true;
    saveAll();
    console.log(C.yellow + '\n  Progress saved. Exiting...' + C.reset);
    process.exit(0);
  });

  function saveAll() {
    try {
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
        found: allFound,
        foundCardIds: [...foundCards],
        totalTested: stats.totalTested,
        testedUrls: testedInThisRun,
        timestamp: new Date().toISOString(),
      }));
    } catch {}
    writeReport();
  }

  function writeReport() {
    let report = `BRUTE15-CORRECTED-MV REPORT\n`;
    report += `${'='.repeat(60)}\n`;
    report += `Generated: ${new Date().toISOString()}\n`;
    report += `Total tested: ${formatNum(stats.totalTested)}\n`;
    report += `Dedup skipped: ${formatNum(stats.skipCount)}\n`;
    report += `Workers: ${CONCURRENCY}\n`;
    report += `Found: ${allFound.length}\n\n`;

    report += 'PATTERN INTELLIGENCE v15:\n';
    report += '  - Reversed word order (Wall_Insects, Web_Spider)\n';
    report += '  - Random CAPS last letter (FouR, PalmS)\n';
    report += '  - Hyphenated compounds (Sixty-FouR)\n';
    report += '  - MV cards use M prefix\n';
    report += '  - No-title variants\n';
    report += '  - Plural/singular variants\n';
    report += '  - French title variants\n';
    report += '  - MV number correction: 149->113, 153->120, 152->128 on CDN\n';
    report += '  - Simple MV URLs: {num}_M_{Name} (no title)\n';
    report += '  - Sakura MV: searching both 135 and 109\n\n';

    if (allFound.length > 0) {
      report += 'FOUND:\n';
      for (const f of allFound) {
        report += `  ${(f.cardId || f.char).padEnd(16)} -> ${f.url}\n`;
        if (f.type === 'legendary') report += `    *** NEW LEGENDARY CARD ***\n`;
      }
      report += '\n';
    }
    const missing = MISSING_CARDS.filter(c => !foundCards.has(c.id));
    report += `STILL MISSING (${missing.length}):\n`;
    for (const c of missing) report += `  ${c.id} (${c.category})\n`;
    try { fs.writeFileSync(REPORT_FILE, report); } catch {}
  }

  let lastDraw = 0;
  function maybeRedraw() {
    const now = Date.now();
    if (now - lastDraw > 500) {
      drawDashboard(stats);
      lastDraw = now;
    }
  }

  // ── Phase 1: Search missing cards ──────────────────────────────────────
  for (let ci = 0; ci < MISSING_CARDS.length; ci++) {
    const card = MISSING_CARDS[ci];

    if (foundCards.has(card.id)) continue;
    if (shutdownRequested) break;

    // Pre-generate URL count
    let urlCount = 0;
    const countGen = generateUrlsForCard(card, skipSet);
    for (const _ of countGen) urlCount++;

    stats.currentCard = {
      id: card.id, name: card.names[0], category: card.category,
      tested: 0, totalUrls: urlCount, startTime: Date.now(),
    };
    maybeRedraw();

    let cardFound = false;
    const gen = generateUrlsForCard(card, skipSet);

    while (!cardFound && !shutdownRequested) {
      const batch = [];
      for (let i = 0; i < CONCURRENCY; i++) {
        const next = gen.next();
        if (next.done) break;
        batch.push(next.value);
      }
      if (batch.length === 0) break;

      const results = await Promise.all(batch.map(async (url) => {
        try {
          const size = await headCheck(url);
          testedInThisRun.push(url);
          return { url, size };
        } catch {
          stats.errors++;
          return { url, size: 0 };
        }
      }));

      stats.currentCard.tested += batch.length;
      stats.totalTested += batch.length;

      for (const { url, size } of results) {
        if (size > 0) {
          const filename = url.split('/').pop().replace(/[?#].*/, '');
          const dest = path.join(OUT_DIR, `${card.id}_${filename}`);
          try { await downloadFile(url, dest); } catch {}
          const entry = { cardId: card.id, url, filename, size, dest, type: card.category };
          allFound.push(entry);
          stats.found.push(entry);
          foundCards.add(card.id);
          stats.foundIds.add(card.id);
          cardFound = true;
          break;
        }
      }

      maybeRedraw();
    }

    saveAll();
  }

  // ── Phase 2: Legendary Hunt ────────────────────────────────────────────
  stats.phase = 'legendary';
  stats.currentCard = null;
  stats.legendaryPhase = {
    tested: 0,
    totalEstimate: ALL_CHARACTERS.length * LEGENDARY_TITLES.length * 10 * WIDTHS.length * EXTS.length,
    currentChar: '',
  };
  maybeRedraw();

  const legendaryGen = generateLegendaryUrls(skipSet);

  while (!shutdownRequested) {
    const batch = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      const next = legendaryGen.next();
      if (next.done) { batch.length === 0 && (shutdownRequested = true); break; }
      batch.push(next.value);
    }
    if (batch.length === 0) break;

    stats.legendaryPhase.currentChar = batch[0].char;

    const results = await Promise.all(batch.map(async ({ url, char, type }) => {
      try {
        const size = await headCheck(url);
        testedInThisRun.push(url);
        return { url, char, type, size };
      } catch {
        stats.errors++;
        return { url, char, type, size: 0 };
      }
    }));

    stats.legendaryPhase.tested += batch.length;
    stats.totalTested += batch.length;

    for (const { url, char, type, size } of results) {
      if (size > 0) {
        const filename = url.split('/').pop().replace(/[?#].*/, '');
        const dest = path.join(OUT_DIR, `LEGENDARY_${char}_${filename}`);
        try { await downloadFile(url, dest); } catch {}
        const entry = { char, url, filename, size, dest, type: 'legendary' };
        allFound.push(entry);
        stats.found.push(entry);
        foundCards.add(`LEGENDARY_${char}`);
        stats.foundIds.add(`LEGENDARY_${char}`);
      }
    }

    maybeRedraw();

    if (stats.legendaryPhase.tested % 30000 < CONCURRENCY) saveAll();
  }

  // Final
  saveAll();
  stats.currentCard = null;
  drawDashboard(stats);

  console.log(C.bold + C.green + '\n  COMPLETE' + C.reset);
  console.log(`  Total tested: ${formatNum(stats.totalTested)}`);
  console.log(`  Found: ${allFound.length}`);
  console.log(`  Report: ${REPORT_FILE}\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
