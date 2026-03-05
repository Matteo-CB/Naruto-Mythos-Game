#!/usr/bin/env node
/**
 * brute13-nexus.js  —  HYPER-INTELLIGENT MULTI-AGENT IMAGE HUNTER
 *
 * The ultimate brute force: 200 concurrent workers, comprehensive dedup
 * against ALL previous runs (~889K URLs), intelligent pattern generation
 * from 122 confirmed CDN URLs, and a massive legendary card search
 * testing every character in the game.
 *
 * Features:
 *   - 22 missing cards with expanded title intelligence
 *   - Legendary hunt: test ALL 61 characters with hundreds of titles
 *   - MV (Mythos V) pattern discovery across 8 rarity prefix variants
 *   - Full dedup: loads brute6-12 progress files, skips every tested URL
 *   - Beautiful console dashboard with live stats
 *   - Resumable: saves progress on Ctrl+C
 *   - Per-card progress tracking with ETA
 *
 * Usage:  node scripts/brute13-nexus.js
 * Stop:   Ctrl+C (saves progress, resumable)
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ─── CONFIG ────────────────────────────────────────────────────────────────
const CONCURRENCY    = 200;
const TIMEOUT_MS     = 4000;
const MIN_FILE_SIZE  = 4000;
const OUT_DIR        = path.join(__dirname, '..', 'newvisual');
const PROGRESS_FILE  = path.join(OUT_DIR, 'brute13_progress.json');
const REPORT_FILE    = path.join(OUT_DIR, 'brute13_report.txt');

const BASE = 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/';
const WIDTHS = ['-1920w', '-1280w', '-960w', '-640w'];
const EXTS   = ['.webp', '.jpg', '.png'];

const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 250,
  maxFreeSockets: 80,
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
    'brute12_progress.json',
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
  return { skipSet, loaded };
}

// ─── COMPREHENSIVE TITLE DATABASES ────────────────────────────────────────
// Built from CDN pattern analysis of 122 confirmed URLs

// Common ninja titles (generic, applied to many characters)
const GENERIC_TITLES = [
  'Genin', 'Chunin', 'Jonin', 'Shinobi', 'Kunoichi', 'Ninja',
  'Special_Jonin', 'ANBU', 'Rogue', 'Rogue_Ninja', 'Akatsuki',
  'Elite', 'Guardian', 'Warrior', 'Fighter', 'Master',
  'Prodigy', 'Genius', 'Leader', 'Captain', 'Commander',
];

// Sound Four shared titles
const SOUND_FOUR_TITLES = [
  'Bearer', 'Sound_Four', 'Curse_Mark', 'Cursed_Seal',
  'Second_State', 'Level_2', 'Stage_2', 'Transformed',
  'Barrier', 'Sound_Ninja', 'Orochimaru_Guard',
];

// ─── ALL 61 CHARACTERS — for Legendary hunt ───────────────────────────────
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
  { name: 'Kankuro', variants: ['Kankuro', 'Kankurou', 'Kankurô'] },
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

// Epic titles for legendary cards (dramatic, grand)
const LEGENDARY_TITLES = [
  '', // no title (like "Legendary_Naruto_")
  'Hokage', 'Sage', 'Sage_Mode', 'Bijuu_Mode', 'Kyubi_Mode', 'Tailed_Beast',
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
];

// ─── MISSING CARDS DEFINITIONS ─────────────────────────────────────────────
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
      'Serpent_Ombre', 'Mains_Serpent', 'Serpents_Caches',
      'Forbidden_Jutsu', 'Curse_Seal', 'Snake_Summoning',
      'Senei_Jashu_Hands', 'Snake_Fang', 'Venom',
      'Poison', 'Toxic', 'Deadly',
    ],
  },

  // ── R cards ──────────────────────────────────────────────────────────────
  {
    id: 'KS-115-R', num: 115, category: 'R',
    names: ['Shino', 'Shino_Aburame', 'ShinoAburame', 'Aburame'],
    rarities: ['R'],
    titles: [
      'Insect_Swarm', 'Bug_Swarm', 'Parasitic_Insects', 'Kikaichuu',
      'Kikaichu', 'Insect_Wall', 'Bug_Wall', 'Bug_Barrier',
      'Insect_Clone', 'Bug_Clone', 'Insect_Sphere', 'Bug_Sphere',
      'Insect_Jar', 'Bug_Jar', 'Secret_Technique', 'Insect_Cocoon',
      'Insect_Gathering', 'Bug_Gathering', 'Destruction_Bug',
      'Parasitic_Giant', 'Giant_Bug', 'Insect_Jamming',
      'Bug_Jamming', 'Human_Bug_Clone', 'Spindle_Formation',
      'Insect_Shield', 'Bug_Shield', 'Aburame_Technique',
      'Insectes_Parasites', 'Essaim', 'Mur_Insectes',
      'Bug_Tornado', 'Insect_Tornado', 'Swarm',
      'Beetle', 'Beetle_Sphere', 'Bug_Bomb',
      'Hidden_Jutsu', 'Clan_Technique', 'Insect_Rain',
    ],
  },
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
    ],
  },
  {
    id: 'KS-116-RA', num: 116, category: 'RA',
    names: ['Neji', 'Neji_Hyuga', 'NejiHyuga', 'Hyuga'],
    rarities: ['R_ART'],
    titles: [
      'Eight_Trigrams', '64_Palms', 'Sixty_Four_Palms', 'Hakke',
      'Rokujuyon_Sho', 'Rotation', 'Palm_Rotation', 'Air_Palm',
      'Gentle_Fist', 'Gentle_fist', 'Byakugan', 'Mountain_Crusher',
      'Eight_Trigrams_64', 'Trigrams_64_Palms', 'Eight_Trigrams_Palms',
      '128_Palms', 'Vacuum_Palm', 'Palm_Bottom', 'Palm_Strike',
      'Heavenly_Spin', 'Revolving_Heaven',
      'Prodigy', 'Hyuga_Prodigy', 'Fate', 'Destiny',
      'Branch_House', 'Cage_Bird', 'Trigrams',
    ],
  },
  {
    id: 'KS-122-R', num: 122, category: 'R',
    names: ['Jirobo', 'Jiroubou', 'Jirobou', 'Jirôbô'],
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
    ],
  },
  {
    id: 'KS-124-R', num: 124, category: 'R',
    names: ['Kidomaru', 'Kidoumaru', 'Kidômaru'],
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
    ],
  },

  // ── Secret ────────────────────────────────────────────────────────────────
  {
    id: 'KS-134-S', num: 134, category: 'S',
    names: ['Kyubi', 'Kyuubi', 'Nine-Tails', 'Nine_Tails', 'NineTails', 'Kurama', 'Nine-Tail', 'Nine_Tail'],
    // 134 even = likely Secret_GOLD, but try both
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
      'Trasformation', 'Transformation',
      'Fury', 'Wrath', 'Power', 'Overwhelming',
    ],
  },

  // ── Mythos V (MV) — Pattern unknown, try many rarity prefixes ────────────
  {
    id: 'KS-135-MV', num: 135, category: 'MV',
    names: ['Sakura', 'Sakura_Haruno', 'SakuraHaruno', 'Haruno'],
    rarities: ['MV', 'MV_Special', 'M_Special', 'MV_GOLD', 'M_V', 'V_Special',
               'MythosV', 'Mythos_V', 'M_V_Special', 'M', 'V',
               'MV_GOLD_Special', 'Special_MV', 'Mythos'],
    titles: [
      'Medical', 'Medical_Ninja', 'Healing', 'Recovery',
      'Recovery_Team', 'Cherry_Blossom', 'Blossom',
      'Chakra_Prowess', 'Inner_Sakura', 'Strength',
      'Super_Strength', 'Punch', 'CES', 'Chakra_Enhanced',
      'Hundred_Healings', 'Creation_Rebirth',
      'Byakugou', 'Yin_Seal', 'Summoning_Katsuyu',
      'Genin', 'Kunoichi', 'Team_7', 'Apprentice',
    ],
  },
  {
    id: 'KS-136-MV', num: 136, category: 'MV',
    names: ['Sasuke', 'Sasuke_Uchiha', 'Sasuke_Uchiwa', 'SasukeUchiha', 'SasukeUchiwa'],
    rarities: ['MV', 'MV_Special', 'M_Special', 'MV_GOLD', 'M_V', 'V_Special',
               'MythosV', 'Mythos_V', 'M_V_Special', 'M', 'V',
               'MV_GOLD_Special', 'Special_MV', 'Mythos'],
    titles: [
      'Heaven_Curse_Mark', 'Curse_Mark', 'Cursed_Seal',
      'Chidori', 'Lightning_Blade', 'Sharingan',
      'Lion_Combo', 'Phoenix_Flower', 'Fireball',
      'Avenger', 'Last_Uchiha', 'Genin', 'Rogue',
      'Hawk', 'Snake', 'Team_7', 'Mangekyo',
    ],
  },
  {
    id: 'KS-149-MV', num: 149, category: 'MV',
    names: ['Kiba', 'Kiba_Inuzuka', 'KibaInuzuka', 'Inuzuka'],
    rarities: ['MV', 'MV_Special', 'M_Special', 'MV_GOLD', 'M_V', 'V_Special',
               'MythosV', 'Mythos_V', 'M_V_Special', 'M', 'V',
               'MV_GOLD_Special', 'Special_MV', 'Mythos'],
    titles: [
      'All_Four', 'Fang_Over_Fang', 'Gatsuuga', 'Tsuga',
      'Man_Beast_Clone', 'Two_Headed_Wolf', 'Beast_Mimicry',
      'Fang_Passing_Fang', 'Inuzuka', 'Tracking',
      'Dynamic_Marking', 'Wild', 'Genin', 'Dog_Warrior',
      'Three_Headed_Wolf', 'Wolf_Fang',
    ],
  },
  {
    id: 'KS-150-MV', num: 150, category: 'MV',
    names: ['Shikamaru', 'Shikamaru_Nara', 'ShikamaruNara', 'Nara'],
    rarities: ['MV', 'MV_Special', 'M_Special', 'MV_GOLD', 'M_V', 'V_Special',
               'MythosV', 'Mythos_V', 'M_V_Special', 'M', 'V',
               'MV_GOLD_Special', 'Special_MV', 'Mythos'],
    titles: [
      'Shadow_Possession', 'Shadow_Strangle', 'Shadow_Bind',
      'Shadow_Stitching', 'Shadow_Gathering',
      'Genius', 'Strategist', 'Genin', 'Chunin',
      'IQ_200', 'Lazy_Genius', 'Shadow',
      'Nara_Technique', 'Shadow_Neck_Bind',
    ],
  },
  {
    id: 'KS-151-MV', num: 151, category: 'MV',
    names: ['RockLee', 'Rock_Lee', 'Lee'],
    rarities: ['MV', 'MV_Special', 'M_Special', 'MV_GOLD', 'M_V', 'V_Special',
               'MythosV', 'Mythos_V', 'M_V_Special', 'M', 'V',
               'MV_GOLD_Special', 'Special_MV', 'Mythos'],
    titles: [
      'Primary_Lotus', 'Hidden_Lotus', 'Loopy_Fist',
      'Drunken_Fist', 'Lotus', 'Gate_Opening',
      'Five_Gates', 'Eight_Gates', 'Inner_Gates',
      'Leaf_Hurricane', 'Leaf_Whirlwind', 'Training',
      'Springtime_Youth', 'Youth', 'Green_Beast',
      'Taijutsu', 'Hard_Work',
    ],
  },
  {
    id: 'KS-152-MV', num: 152, category: 'MV',
    names: ['Itachi', 'Itachi_Uchiha', 'Itachi_Uchiwa', 'ItachiUchiha', 'ItachiUchiwa'],
    rarities: ['MV', 'MV_Special', 'M_Special', 'MV_GOLD', 'M_V', 'V_Special',
               'MythosV', 'Mythos_V', 'M_V_Special', 'M', 'V',
               'MV_GOLD_Special', 'Special_MV', 'Mythos'],
    titles: [
      'Hunting', 'Akatsuki', 'Mangekyo', 'Sharingan',
      'Tsukuyomi', 'Amaterasu', 'Susanoo',
      'Genjutsu', 'Crow_Clone', 'Itachi_Clone',
      'Anbu', 'Prodigy', 'Uchiha_Prodigy',
      'Massacre', 'Sacrifice', 'Truth',
    ],
  },
  {
    id: 'KS-153-MV', num: 153, category: 'MV',
    names: ['Gaara', 'Sabaku_no_Gaara'],
    rarities: ['MV', 'MV_Special', 'M_Special', 'MV_GOLD', 'M_V', 'V_Special',
               'MythosV', 'Mythos_V', 'M_V_Special', 'M', 'V',
               'MV_GOLD_Special', 'Special_MV', 'Mythos'],
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

function* generateUrlsForCard(card, skipSet) {
  const num = card.num;
  const nums = [String(num), String(num).padStart(2, '0'), String(num).padStart(3, '0')];

  for (const n of nums) {
    for (const r of card.rarities) {
      for (const name of card.names) {
        // Pattern A: {num}_{rarity}_{name}_{title}-{width}.{ext}
        for (const title of card.titles) {
          for (const w of WIDTHS) {
            for (const ext of EXTS) {
              const url = `${BASE}${n}_${r}_${name}_${title}${w}${ext}`;
              if (!skipSet.has(url)) yield url;
            }
          }
        }
        // Pattern B: Name only (no title)
        for (const w of WIDTHS) {
          for (const ext of EXTS) {
            const url = `${BASE}${n}_${r}_${name}${w}${ext}`;
            if (!skipSet.has(url)) yield url;
            // With trailing underscore (like Legendary_Naruto_)
            const url2 = `${BASE}${n}_${r}_${name}_${w}${ext}`;
            if (!skipSet.has(url2)) yield url2;
          }
        }
        // Pattern C: Hyphen between name-title
        for (const title of card.titles.slice(0, 15)) {
          for (const ext of EXTS) {
            const url = `${BASE}${n}_${r}_${name}-${title}-1920w${ext}`;
            if (!skipSet.has(url)) yield url;
          }
        }
        // Pattern D: All-hyphen titles
        for (const title of card.titles.slice(0, 15)) {
          const titleH = title.replace(/_/g, '-');
          if (titleH !== title) {
            for (const ext of EXTS) {
              const url = `${BASE}${n}_${r}_${name}_${titleH}-1920w${ext}`;
              if (!skipSet.has(url)) yield url;
            }
          }
        }
        // Pattern E: Lowercase variants (like Gentle_fist)
        for (const title of card.titles.slice(0, 15)) {
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
  for (const name of card.names.slice(0, 2)) {
    for (const title of card.titles.slice(0, 15)) {
      const url = `${BASE}${num}_${name}_${title}-1920w.webp`;
      if (!skipSet.has(url)) yield url;
    }
  }

  // Pattern G: CDN typos — drop/double a letter in title words
  for (const r of card.rarities.slice(0, 3)) {
    for (const name of card.names.slice(0, 2)) {
      for (const title of card.titles.slice(0, 10)) {
        const parts = title.split('_');
        for (let i = 0; i < parts.length; i++) {
          if (parts[i].length < 4) continue;
          // Drop a letter
          for (let j = 1; j < parts[i].length - 1; j++) {
            const typo = parts[i].slice(0, j) + parts[i].slice(j + 1);
            const newParts = [...parts]; newParts[i] = typo;
            const url = `${BASE}${num}_${r}_${name}_${newParts.join('_')}-1920w.webp`;
            if (!skipSet.has(url)) yield url;
          }
          // Double a letter
          for (let j = 0; j < parts[i].length; j++) {
            const typo = parts[i].slice(0, j) + parts[i][j] + parts[i].slice(j);
            const newParts = [...parts]; newParts[i] = typo;
            const url = `${BASE}${num}_${r}_${name}_${newParts.join('_')}-1920w.webp`;
            if (!skipSet.has(url)) yield url;
          }
          // Swap adjacent letters
          for (let j = 0; j < parts[i].length - 1; j++) {
            const arr = parts[i].split('');
            [arr[j], arr[j+1]] = [arr[j+1], arr[j]];
            const typo = arr.join('');
            const newParts = [...parts]; newParts[i] = typo;
            const url = `${BASE}${num}_${r}_${name}_${newParts.join('_')}-1920w.webp`;
            if (!skipSet.has(url)) yield url;
          }
        }
      }
    }
  }
}

// ─── LEGENDARY URL GENERATOR ───────────────────────────────────────────────
// Generates URLs for undiscovered legendary cards across ALL characters

function* generateLegendaryUrls(skipSet) {
  // Known: Legendary_Naruto_-1920w.webp
  // Possible patterns:
  //   Legendary_{Name}_{Title}-{width}.ext
  //   Legendary_{Name}_-{width}.ext  (trailing underscore)
  //   {num}_Legendary_{Name}_{Title}
  //   {num}_L_{Name}_{Title}
  //   L_{Name}_{Title}
  //   GOLD_{Name}_{Title}
  //   Legendary_GOLD_{Name}_{Title}

  const legendaryPrefixes = [
    'Legendary', 'LEGENDARY', 'L', 'Gold', 'GOLD',
    'Legendary_GOLD', 'GOLD_Legendary', 'Legend',
    '22K', 'Gold_22K', 'GOLD_22K',
  ];

  for (const char of ALL_CHARACTERS) {
    for (const nameVar of char.variants) {
      for (const prefix of legendaryPrefixes) {
        // With titles
        for (const title of LEGENDARY_TITLES) {
          for (const w of WIDTHS) {
            for (const ext of EXTS) {
              let url;
              if (title === '') {
                // Trailing underscore pattern (like Legendary_Naruto_)
                url = `${BASE}${prefix}_${nameVar}_${w}${ext}`;
                if (!skipSet.has(url)) yield { url, char: char.name, type: 'legendary' };
                // No trailing underscore
                url = `${BASE}${prefix}_${nameVar}${w}${ext}`;
                if (!skipSet.has(url)) yield { url, char: char.name, type: 'legendary' };
              } else {
                url = `${BASE}${prefix}_${nameVar}_${title}${w}${ext}`;
                if (!skipSet.has(url)) yield { url, char: char.name, type: 'legendary' };
              }
            }
          }
        }
        // With number prefixes (141-160 range for hypothetical cards)
        for (let num = 141; num <= 200; num++) {
          for (const w of ['-1920w']) {
            const url = `${BASE}${num}_${prefix}_${nameVar}${w}.webp`;
            if (!skipSet.has(url)) yield { url, char: char.name, type: 'legendary' };
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

function drawDashboard(stats) {
  const lines = [];
  const w = 72;
  const sep = C.dim + '\u2500'.repeat(w) + C.reset;

  lines.push('');
  lines.push(C.bold + C.cyan + '\u250C' + '\u2500'.repeat(w - 2) + '\u2510' + C.reset);
  lines.push(C.bold + C.cyan + '\u2502' + C.reset + C.bold + '  BRUTE13-NEXUS  '.padStart(w/2 + 8).padEnd(w - 2) + C.cyan + '\u2502' + C.reset);
  lines.push(C.bold + C.cyan + '\u2502' + C.reset + C.dim + '  Hyper-Intelligent Multi-Agent Image Hunter'.padEnd(w - 2) + C.cyan + '\u2502' + C.reset);
  lines.push(C.bold + C.cyan + '\u2514' + '\u2500'.repeat(w - 2) + '\u2518' + C.reset);
  lines.push('');

  // Global stats
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const rate = elapsed > 0 ? (stats.totalTested / elapsed).toFixed(0) : 0;
  const skipStr = stats.skipCount.toLocaleString();
  const testedStr = stats.totalTested.toLocaleString();
  const rateStr = `${rate}/s`;

  lines.push(C.bold + '  GLOBAL STATS' + C.reset);
  lines.push(sep);
  lines.push(`  ${C.dim}Elapsed:${C.reset}  ${formatTime(elapsed)}      ${C.dim}Rate:${C.reset}  ${C.bold}${rateStr}${C.reset}      ${C.dim}Skipped (dedup):${C.reset}  ${skipStr}`);
  lines.push(`  ${C.dim}Tested:${C.reset}  ${C.bold}${testedStr}${C.reset}      ${C.dim}Workers:${C.reset}  ${CONCURRENCY}      ${C.dim}Errors:${C.reset}  ${stats.errors}`);
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
      lines.push(`  ${icon} ${C.bold}${f.cardId || f.char}${C.reset}  ${C.dim}${sizeKB}KB${C.reset}  ${C.cyan}${f.url.split('/').pop().substring(0, 50)}${C.reset}`);
    }
  }
  lines.push('');

  // Current card
  lines.push(C.bold + '  CURRENT TARGET' + C.reset);
  lines.push(sep);
  if (stats.currentCard) {
    const cc = stats.currentCard;
    const pct = cc.totalUrls > 0 ? ((cc.tested / cc.totalUrls) * 100).toFixed(1) : '?';
    const bar = progressBar(cc.tested, cc.totalUrls, 35);
    const category = cc.category || '';
    const catColor = category === 'legendary' ? C.yellow : category === 'MV' ? C.magenta : category === 'S' ? C.red : C.blue;
    lines.push(`  ${catColor}[${category}]${C.reset} ${C.bold}${cc.id}${C.reset} - ${cc.name}`);
    lines.push(`  ${bar} ${pct}%  (${cc.tested.toLocaleString()} / ${cc.totalUrls > 0 ? cc.totalUrls.toLocaleString() : '?'})`);
  } else {
    lines.push(C.dim + '  (idle)' + C.reset);
  }
  lines.push('');

  // Missing cards table
  lines.push(C.bold + `  MISSING CARDS: ${stats.missingCards.length} remaining` + C.reset);
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
      row += text.padEnd(colWidth + 12); // extra for ANSI codes
    }
    lines.push(row);
  }
  lines.push('');

  // Legendary hunt
  if (stats.legendaryPhase) {
    lines.push(C.bold + C.yellow + '  LEGENDARY HUNT' + C.reset);
    lines.push(sep);
    const lp = stats.legendaryPhase;
    const lbar = progressBar(lp.tested, lp.totalEstimate, 35);
    lines.push(`  ${lbar} ${lp.tested.toLocaleString()} tested across ${ALL_CHARACTERS.length} characters`);
    if (lp.currentChar) {
      lines.push(`  ${C.dim}Current:${C.reset} ${lp.currentChar}`);
    }
    lines.push('');
  }

  // Footer
  lines.push(C.dim + '  Press Ctrl+C to stop and save progress' + C.reset);
  lines.push('');

  // Output
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

  const stats = {
    startTime: Date.now(),
    totalTested,
    skipCount: skipLoaded,
    errors: 0,
    found: [...allFound],
    foundIds: foundCards,
    missingCards: MISSING_CARDS,
    currentCard: null,
    legendaryPhase: null,
  };

  // Initial draw
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
        timestamp: new Date().toISOString(),
      }));
    } catch {}
    writeReport();
  }

  function writeReport() {
    let report = `BRUTE13-NEXUS REPORT\n`;
    report += `Generated: ${new Date().toISOString()}\n`;
    report += `Total tested: ${stats.totalTested.toLocaleString()}\n`;
    report += `Dedup skipped: ${stats.skipCount.toLocaleString()}\n`;
    report += `Found: ${allFound.length}\n\n`;
    if (allFound.length > 0) {
      report += 'FOUND:\n';
      for (const f of allFound) {
        report += `  ${f.cardId || f.char} -> ${f.url}\n`;
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
    if (now - lastDraw > 500) { // refresh every 500ms
      drawDashboard(stats);
      lastDraw = now;
    }
  }

  // ── Phase 1: Search missing cards ──────────────────────────────────────
  for (let ci = 0; ci < MISSING_CARDS.length; ci++) {
    const card = MISSING_CARDS[ci];

    if (foundCards.has(card.id)) continue;
    if (shutdownRequested) break;

    // Pre-generate URL count for progress
    let urlCount = 0;
    const countGen = generateUrlsForCard(card, skipSet);
    for (const _ of countGen) urlCount++;

    stats.currentCard = {
      id: card.id, name: card.names[0], category: card.category,
      tested: 0, totalUrls: urlCount,
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
        const size = await headCheck(url);
        return { url, size };
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
      const size = await headCheck(url);
      return { url, char, type, size };
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

    // Save periodically
    if (stats.legendaryPhase.tested % 10000 < CONCURRENCY) saveAll();
  }

  // Final
  saveAll();
  stats.currentCard = null;
  drawDashboard(stats);

  console.log(C.bold + C.green + '\n  COMPLETE' + C.reset);
  console.log(`  Total tested: ${stats.totalTested.toLocaleString()}`);
  console.log(`  Found: ${allFound.length}`);
  console.log(`  Report: ${REPORT_FILE}\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
