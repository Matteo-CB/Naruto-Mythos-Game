#!/usr/bin/env node
/**
 * brute20-all-missing.js  —  MEGA HUNTER FOR ALL 13 MISSING CARDS
 *
 * Targets every missing card EXCEPT KS-135-MV and KS-136-MV (handled by brute19).
 * Uses proven CDN naming patterns per rarity, with massive title word combinations.
 *
 * Missing cards:
 *   UC:  KS-045-UC  Anko Mitarashi "Shadow Snake Hands"
 *   R:   KS-122-R   Jirobo "Arhat Fist"
 *   R:   KS-124-R   Kidomaru "Spider Bow: Fierce Rip"
 *   R:   KS-126-R   Orochimaru "Get out of my way."
 *   R:   KS-127-R   Sakon "Stone Fist"
 *   R:   KS-129-R   Nine-Tails "Demon Fox Cloak"
 *   R:   KS-130-R   One-Tail "I hope you're ready to die!"
 *   S:   KS-134-S   Nine-Tailed Fox "The Beast Awakens"
 *   RA:  KS-115-RA  Shino Aburame "Insect Wall Technique"
 *   RA:  KS-122-RA  Jirobo "Arhat Fist"
 *   RA:  KS-124-RA  Kidomaru "Spider Bow: Fierce Rip"
 *   RA:  KS-127-RA  Sakon "Stone Fist"
 *   RA:  KS-129-RA  Nine-Tails "Demon Fox Cloak"
 *
 * Proven CDN patterns:
 *   UC:  {num}_UC_{Name}_{Title}
 *   R:   {num}_R_{Name}_{Title}
 *   RA:  {num}_R_ART_{Name}_{Title}
 *   S:   {num}_Secret_GOLD_{Name}_{Title}
 *   S:   {num}_SecretV_GOLD_{Name}_{Title}
 *
 * Known CDN name spellings (from C/UC cards already found):
 *   Anko: "Anko"
 *   Jirobo: "Jiroubou" (C) AND "Jirobo" (UC) — BOTH!
 *   Kidomaru: "Kidomaru"
 *   Orochimaru: "Orochimaru"
 *   Sakon: "Sakon"
 *   Shino: "Shino"
 *   One-Tail: "One-Tail" (with hyphen, UC: 76_UC_One-Tail_Partial_Trasformation)
 *   Nine-Tails: likely "Nine-Tails" (by analogy)
 *
 * Usage:  node scripts/brute20-all-missing.js
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// --- CONFIG ---
const CONCURRENCY   = 10000;
const TIMEOUT_MS    = 6000;
const MIN_FILE_SIZE = 4000;
const OUT_DIR       = path.join(__dirname, '..', 'newvisual');
const REPORT_FILE   = path.join(OUT_DIR, 'brute20_report.txt');
const PROGRESS_FILE = path.join(OUT_DIR, 'brute20_progress.json');
const BASE = 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/';

const agent = new https.Agent({ keepAlive: true, maxSockets: 10000, maxFreeSockets: 2000, timeout: TIMEOUT_MS });
const C = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', red: '\x1b[31m', magenta: '\x1b[35m' };

// ═══════════════════════════════════════════════════════════════════════════
// TITLE WORDS PER CHARACTER (from card data + CDN vocabulary + thematic)
// ═══════════════════════════════════════════════════════════════════════════

// Shared word pool (proven CDN vocabulary + common descriptors)
const SHARED_WORDS = [
  // Proven CDN title words (from all found URLs)
  'Agent', 'Armed', 'Assassination', 'Assistant', 'Bearer', 'Beast', 'Bell', 'Bind',
  'Black', 'Blade', 'Boulder', 'Byakugan', 'Camelia', 'Careteaker', 'Chakra', 'Chief',
  'Clone', 'Coffin', 'Council', 'Crystal', 'Curse', 'Dance', 'Dark', 'Demon', 'Dome',
  'Earth', 'Echo', 'Eldest', 'Elite', 'Expansion', 'Ferocious', 'Fist', 'Flute', 'Four',
  'Genin', 'Gentle', 'Giant', 'Guard', 'Healing', 'Heaven', 'Hokage', 'Hound', 'Human',
  'Hunting', 'Ice', 'Insects', 'Instructor', 'Iron', 'Jinchuriki', 'Jutsu', 'Knives',
  'Kubikiribocho', 'Kunoichi', 'Last', 'Lightning', 'Loopy', 'Lotus', 'Maiden', 'Man',
  'Mark', 'Master', 'Medical', 'Mind', 'Mirrors', 'Molecular', 'Mouth', 'Needle',
  'Ninja', 'Nirvana', 'Ogres', 'Orphan', 'Palm', 'Palms', 'Parasitic', 'Partial',
  'Pig', 'Possession', 'Primary', 'Proctor', 'Professor', 'Prowess', 'Puppet', 'Rage',
  'Ramen', 'Rasengan', 'Rashomon', 'Recovery', 'Ritual', 'Rogue', 'Rotation', 'Sage',
  'Sand', 'Sandstorm', 'Scythe', 'Seal', 'Shadow', 'Sharingan', 'Shield', 'Shikotsumyaku',
  'Shinobi', 'Shot', 'Slicing', 'Slug', 'Son', 'Sound', 'Speaker', 'Specialist',
  'Spider', 'Strangle', 'Substitution', 'Summoning', 'Superhuman', 'Swamp', 'Teacher',
  'Team', 'Temple', 'Threads', 'Toad', 'Trainer', 'Training', 'Transfer', 'Transference',
  'Trasformation', 'Transformation', 'Tree', 'Trench', 'Undercover', 'Wall', 'Weapon',
  'Web', 'Wind', 'Wolf', 'Yin',
  // GOLD variants
  'GOLD', 'Special',
  // Generic combat/power words
  'Attack', 'Barrage', 'Battle', 'Blast', 'Block', 'Blow', 'Bomb', 'Boost', 'Break',
  'Burst', 'Charge', 'Clash', 'Claw', 'Combo', 'Counter', 'Crash', 'Crush', 'Cut',
  'Deadly', 'Death', 'Defense', 'Destroy', 'Devour', 'Drain', 'Drive', 'Dual',
  'Eruption', 'Explode', 'Explosion', 'Extreme', 'Fierce', 'Final', 'Force', 'Full',
  'Fury', 'Grand', 'Grip', 'Ground', 'Hammer', 'Hard', 'Heavy', 'Hit', 'Impact',
  'Kill', 'Killer', 'Lance', 'Lethal', 'Lock', 'Max', 'Mega', 'Might', 'Overpower',
  'Pierce', 'Pound', 'Power', 'Punch', 'Rampage', 'Raw', 'Rip', 'Rush', 'Savage',
  'Shatter', 'Slam', 'Slash', 'Smash', 'Spike', 'Split', 'Storm', 'Strike', 'Strong',
  'Super', 'Supreme', 'Surge', 'Sweep', 'Swift', 'Tail', 'Tails', 'Terror', 'Thunder',
  'Total', 'Triple', 'True', 'Ultimate', 'Unleash', 'Venom', 'Vicious', 'Violent',
  'Wild', 'Wrath',
  // Nature elements
  'Fire', 'Water', 'Lightning', 'Wind', 'Earth', 'Lava', 'Wood', 'Steel', 'Poison',
  // Body parts / actions
  'Arm', 'Body', 'Claw', 'Eye', 'Eyes', 'Finger', 'Foot', 'Hand', 'Hands', 'Head',
  'Jaw', 'Kick', 'Knee', 'Leg', 'Mouth', 'Neck', 'Tail', 'Teeth', 'Tongue',
  // Ranks
  'Genin', 'Chunin', 'Jonin', 'Kage', 'ANBU', 'Sannin', 'Sensei',
  // Misc
  'Awakening', 'Barrier', 'Blood', 'Bone', 'Chains', 'Cloak', 'Control', 'Curse',
  'Darkness', 'Despair', 'Devastation', 'Domain', 'Domination', 'Doom', 'Dread',
  'Fear', 'Gate', 'Gates', 'Grudge', 'Hatred', 'Horror', 'Hunt', 'Invasion',
  'Menace', 'Monster', 'Nightmare', 'Oblivion', 'Prison', 'Rampage', 'Reign',
  'Release', 'Revenge', 'Roar', 'Ruin', 'Scream', 'Siege', 'Slaughter',
  'Spawn', 'Swallow', 'Torment', 'Trap', 'Unleashed', 'Unstoppable', 'Wail',
];

// ═══════════════════════════════════════════════════════════════════════════
// TARGET CARDS
// ═══════════════════════════════════════════════════════════════════════════
const TARGET_CARDS = [
  // ──────────────── UC ────────────────
  {
    id: 'KS-045-UC', char: 'Anko', num: 45,
    tags: ['UC'],
    names: ['Anko', 'Anko_Mitarashi', 'AnkoMitarashi', 'Mitarashi_Anko', 'Anko-Mitarashi'],
    // Title: "Shadow Snake Hands" / effects: AMBUSH defeat hidden
    words: [
      'Shadow_Snake_Hands', 'Shadow_Snake', 'Snake_Hands', 'Snake', 'Shadow',
      'Snake_Hand', 'Hands', 'Serpent', 'Spectral', 'Spectral_Snake',
      'Shadow_Serpent', 'Viper', 'Striking_Snake', 'Hidden_Snake',
      'Many_Hidden_Shadow_Snake', 'Many_Shadow_Snake',
      'Ambush', 'Surprise', 'Stealth', 'Covert', 'Hidden',
      'Assassination', 'Assassin', 'Killer', 'Deadly',
      'Proctor', 'Examiner', 'Special_Jonin', 'Jonin',
      'Forest_of_Death', 'Forest', 'Death',
      'Curse', 'Curse_Mark', 'Cursed',
      'Dango', 'Kunai', 'Trench_Coat', 'Trench',
      'Orochimaru', 'Student', 'Disciple',
      'Senei_Jashu', 'Senei', 'Jashu',
      'Striking', 'Fang', 'Bite', 'Coil',
    ],
  },
  // ──────────────── R ────────────────
  {
    id: 'KS-122-R', char: 'Jirobo', num: 122,
    tags: ['R'],
    // CDN uses BOTH "Jiroubou" (C) and "Jirobo" (UC)
    names: ['Jirobo', 'Jiroubou', 'Jiroubo', 'Jirobou', 'Jiroubou_Bearer', 'Jirōbō'],
    // Title: "Arhat Fist" / effect: POWERUP X
    words: [
      'Arhat_Fist', 'Arhat', 'Fist',
      'Sound_Four', 'Sound', 'Four', 'Bearer',
      'Earth_Dome', 'Earth', 'Dome', 'Prison',
      'Curse_Seal', 'Curse', 'Seal', 'Level_2', 'Level2',
      'Cursed_Seal', 'Cursed', 'Second_State', 'State_2',
      'Powerup', 'Power', 'Strength', 'Strong', 'Brute',
      'Giant', 'Tank', 'Guard', 'Wall', 'Barrier',
      'Taijutsu', 'Combat', 'Fighter', 'Warrior',
      'Absorb', 'Absorption', 'Chakra_Absorption', 'Drain',
      'Boulder', 'Rock', 'Stone', 'Mountain',
      'Rage', 'Fury', 'Fierce', 'Brutal',
      'Oto', 'Otogakure',
    ],
  },
  {
    id: 'KS-124-R', char: 'Kidomaru', num: 124,
    tags: ['R'],
    names: ['Kidomaru', 'Kidoumaru', 'Kidômaru'],
    // Title: "Spider Bow: Fierce Rip" / effect: AMBUSH defeat P3 other mission
    words: [
      'Spider_Bow', 'Fierce_Rip', 'Spider_Bow_Fierce_Rip',
      'Spider', 'Bow', 'Fierce', 'Rip',
      'Arrow', 'Sniper', 'Archer', 'Archery',
      'Web', 'Spider_Web', 'Sticky', 'Silk', 'Thread', 'Net',
      'Sound_Four', 'Sound', 'Four', 'Bearer',
      'Curse_Seal', 'Curse', 'Seal', 'Level_2', 'Level2',
      'Cursed_Seal', 'Cursed', 'Second_State', 'State_2',
      'Six_Arms', 'Six', 'Arms', 'Multi_Arm',
      'Gold', 'Golden', 'Golden_Arrow', 'Gold_Arrow',
      'Summoning', 'Summon', 'Spider_Summon',
      'Kumosoukai', 'Kumo', 'Nenkin',
      'Ambush', 'Snipe', 'Long_Range', 'Range',
      'Hunt', 'Hunter', 'Predator', 'Prey',
      'Oto', 'Otogakure',
    ],
  },
  {
    id: 'KS-126-R', char: 'Orochimaru', num: 126,
    tags: ['R'],
    names: ['Orochimaru'],
    // Title: "Get out of my way." / effect: SCORE defeat weakest
    words: [
      'Get_Out', 'Get_Out_of_My_Way', 'My_Way', 'Out_of_My_Way',
      'Way', 'Obstacle', 'Path', 'Clear', 'Move',
      'Sannin', 'Snake', 'Serpent', 'Viper', 'Python',
      'Rogue', 'Rogue_Ninja', 'Villain', 'Evil', 'Dark',
      'Score', 'Victory', 'Defeat', 'Destroy', 'Eliminate',
      'Weakest', 'Weak', 'Prey', 'Hunt',
      'Rashomon', 'Triple_Rashomon', 'Triple', 'Gate', 'Gates',
      'Kusanagi', 'Sword', 'Blade', 'Katana',
      'Immortal', 'Immortality', 'Eternal', 'Body',
      'Forbidden', 'Jutsu', 'Forbidden_Jutsu', 'Kinjutsu',
      'Reanimation', 'Edo_Tensei', 'Edo', 'Tensei',
      'Sound', 'Otogakure', 'Oto', 'Leader',
      'Fear', 'Terror', 'Menace', 'Dread', 'Horror',
      'Predator', 'Monster', 'Demon',
      'Ambition', 'Desire', 'Power', 'Control',
      'Conqueror', 'Domination', 'Reign', 'Rule',
      'Curse_Mark', 'Mark', 'Curse', 'Seal',
      'White_Snake', 'White', 'Shed', 'Skin',
      'Substitution', 'Undercover', 'Infiltrator',
      'Shadow', 'Darkness', 'Night',
    ],
  },
  {
    id: 'KS-127-R', char: 'Sakon', num: 127,
    tags: ['R'],
    names: ['Sakon', 'Sakon_Ukon', 'SakonUkon'],
    // Title: "Stone Fist" / effect: [⧗] -1 Power enemies
    words: [
      'Stone_Fist', 'Stone', 'Fist',
      'Sound_Four', 'Sound', 'Four', 'Bearer',
      'Black_Seal', 'Black', 'Seal',
      'Curse_Seal', 'Curse', 'Level_2', 'Level2',
      'Cursed_Seal', 'Cursed', 'Second_State', 'State_2',
      'Ukon', 'Twin', 'Twins', 'Brother', 'Brothers', 'Duo',
      'Molecular', 'Possession', 'Molecular_Possession',
      'Parasite', 'Parasitic', 'Merge', 'Fusion',
      'Weaken', 'Debuff', 'Drain', 'Reduce', 'Minus',
      'Continuous', 'Aura', 'Field', 'Suppress',
      'Demon', 'Ogre', 'Oni', 'Monster',
      'Rashomon', 'Gate', 'Gates',
      'Oto', 'Otogakure',
    ],
  },
  {
    id: 'KS-129-R', char: 'Nine-Tails', num: 129,
    tags: ['R'],
    names: [
      'Nine-Tails', 'NineTails', 'Nine_Tails', 'Kyubi', 'Kyuubi',
      'Kurama', 'Nine-Tails_Kyubi', 'Naruto_Nine-Tails', 'Naruto_Kyubi',
      'Nine_Tailed', 'NineTailed', 'Fox', 'Demon_Fox',
    ],
    // Title: "Demon Fox Cloak" / effect: upgrade over Naruto, can't be hidden/defeated
    words: [
      'Demon_Fox_Cloak', 'Demon_Fox', 'Fox_Cloak', 'Demon', 'Cloak',
      'Fox', 'Tailed_Beast', 'Tailed', 'Beast', 'Bijuu', 'Bijuudama',
      'Chakra_Cloak', 'Chakra', 'Red_Chakra', 'Red',
      'Naruto', 'Jinchuriki', 'Jinchuuriki', 'Host',
      'Upgrade', 'Evolution', 'Transform', 'Transformation',
      'Invincible', 'Indestructible', 'Unstoppable', 'Immortal',
      'Rage', 'Fury', 'Wrath', 'Anger', 'Berserk', 'Rampage',
      'Roar', 'Howl', 'Scream', 'Terror',
      'Power', 'Overwhelming', 'Devastating', 'Destructive',
      'One_Tail', 'Two_Tails', 'Three_Tails', 'Four_Tails',
      'Partial', 'Partial_Transformation', 'Trasformation',
      'Seal', 'Unsealed', 'Released', 'Unleashed', 'Awakened',
      'Monster', 'Nightmare', 'Horror', 'Dread',
      'Fire', 'Blaze', 'Inferno', 'Burn',
      'Claw', 'Claws', 'Fang', 'Fangs', 'Tail',
      'Shroud', 'Aura', 'Mantle', 'Coat',
    ],
  },
  {
    id: 'KS-130-R', char: 'One-Tail', num: 130,
    tags: ['R'],
    names: [
      'One-Tail', 'OneTail', 'One_Tail', 'Ichibi', 'Shukaku',
      'Gaara_One-Tail', 'Gaara_Ichibi', 'Gaara_Shukaku',
      'One_Tailed', 'Sand_Spirit', 'Tanuki',
    ],
    // Title: "I hope you're ready to die!" / effect: can't be hidden/defeated, upgrade over Gaara
    words: [
      'Ready_to_Die', 'Ready', 'Die', 'Death', 'Kill',
      'Hope', 'Hope_Ready', 'Die_Ready',
      'Tailed_Beast', 'Tailed', 'Beast', 'Bijuu',
      'Sand', 'Sand_Spirit', 'Spirit', 'Demon',
      'Gaara', 'Jinchuriki', 'Jinchuuriki', 'Host',
      'Upgrade', 'Evolution', 'Transform', 'Transformation',
      'Invincible', 'Indestructible', 'Unstoppable', 'Immortal',
      'Rage', 'Fury', 'Wrath', 'Berserk', 'Rampage', 'Madness',
      'Roar', 'Howl', 'Scream', 'Terror',
      'Devastation', 'Destruction', 'Catastrophe', 'Annihilation',
      'Partial', 'Partial_Transformation', 'Full', 'Full_Transformation',
      'Trasformation', 'Awakening', 'Awakened',
      'Seal', 'Unsealed', 'Released', 'Unleashed',
      'Monster', 'Nightmare', 'Horror',
      'Wind', 'Desert', 'Sandstorm',
      'Tail', 'Claw', 'Claws', 'Arm',
      'Shroud', 'Aura', 'Mantle', 'Cloak',
      'Play_Possum', 'Possum', 'Sleep', 'Sleeping',
    ],
  },
  // ──────────────── S (Secret) ────────────────
  {
    id: 'KS-134-S', char: 'Nine-Tailed Fox', num: 134,
    tags: ['Secret_GOLD', 'SecretV_GOLD', 'Secret', 'SecretV', 'S_GOLD', 'S'],
    names: [
      'Kyubi', 'Kyuubi', 'Kurama', 'Nine-Tails', 'NineTails', 'Nine_Tails',
      'Nine-Tailed_Fox', 'Nine_Tailed_Fox', 'NineTailedFox', 'Nine-Tailed',
      'Demon_Fox', 'Fox', 'Kitsune',
      'Naruto_Kyubi', 'Naruto_Nine-Tails', 'Naruto_Fox',
    ],
    // Title: "The Beast Awakens" / "Destruction" (fr)
    // Effect: can't be hidden/defeated, upgrade: defeat all P5 or less
    words: [
      'Beast_Awakens', 'Beast', 'Awakens', 'Awakening', 'Awakened',
      'The_Beast_Awakens', 'The_Beast',
      'Destruction', 'Destroyer', 'Devastation', 'Annihilation',
      'Full_Power', 'Full', 'Power', 'Maximum', 'Max',
      'Tailed_Beast', 'Tailed', 'Bijuu', 'Bijuudama',
      'Nine', 'Tails', 'Fox',
      'Jinchuriki', 'Jinchuuriki', 'Host',
      'Invincible', 'Indestructible', 'Unstoppable', 'Immortal',
      'Rampage', 'Berserk', 'Rage', 'Fury', 'Wrath',
      'Roar', 'Howl', 'Scream',
      'Fire', 'Blaze', 'Inferno', 'Hell',
      'Cataclysm', 'Apocalypse', 'Doom', 'End',
      'Unsealed', 'Released', 'Unleashed', 'Freed',
      'Complete', 'Perfect', 'True_Form', 'Form',
      'Monster', 'Titan', 'Colossus', 'Giant',
      'Chakra', 'Red_Chakra', 'Red',
      'Bomb', 'Tailed_Beast_Bomb', 'Bijuu_Bomb',
      'Tail', 'Cloak', 'Shroud', 'Mantle',
      'Terror', 'Horror', 'Nightmare', 'Dread',
      'Calamity', 'Catastrophe', 'Cataclysm',
    ],
  },
  // ──────────────── RA (Rare Art) ────────────────
  {
    id: 'KS-115-RA', char: 'Shino', num: 115,
    tags: ['R_ART'],
    // Known R: 115_R_Shino_Wall_Insects
    names: ['Shino', 'Shino_Aburame', 'ShinoAburame', 'Aburame_Shino'],
    words: [
      // Same title as R (Insect Wall Technique)
      'Wall_Insects', 'Wall', 'Insects', 'Insect_Wall', 'Insect',
      'Insect_Wall_Technique', 'Technique',
      'Parasitic', 'Parasitic_Insects', 'Bug', 'Bugs',
      'Beetle', 'Beetles', 'Kikaichu', 'Kikaichuu',
      'Destruction', 'Destruction_Bugs', 'Colony',
      'Shield', 'Barrier', 'Protection', 'Defense',
      'Silent', 'Quiet', 'Stoic', 'Calm',
      'Team_8', 'Team8', 'Aburame',
      'Jutsu', 'Ninja', 'Shinobi', 'Genin',
    ],
  },
  {
    id: 'KS-122-RA', char: 'Jirobo RA', num: 122,
    tags: ['R_ART'],
    names: ['Jirobo', 'Jiroubou', 'Jiroubo', 'Jirobou'],
    words: [
      'Arhat_Fist', 'Arhat', 'Fist',
      'Sound_Four', 'Sound', 'Four', 'Bearer',
      'Earth_Dome', 'Earth', 'Dome', 'Prison',
      'Curse_Seal', 'Curse', 'Seal', 'Level_2',
      'Cursed_Seal', 'Cursed', 'Second_State',
      'Powerup', 'Power', 'Strength', 'Brute',
      'Taijutsu', 'Combat', 'Fighter',
      'Absorb', 'Absorption', 'Drain',
      'Boulder', 'Rock', 'Stone',
      'Rage', 'Fury', 'Fierce',
    ],
  },
  {
    id: 'KS-124-RA', char: 'Kidomaru RA', num: 124,
    tags: ['R_ART'],
    names: ['Kidomaru', 'Kidoumaru'],
    words: [
      'Spider_Bow', 'Fierce_Rip', 'Spider_Bow_Fierce_Rip',
      'Spider', 'Bow', 'Fierce', 'Rip',
      'Arrow', 'Sniper', 'Archer',
      'Web', 'Spider_Web', 'Sticky', 'Thread', 'Net',
      'Sound_Four', 'Sound', 'Four', 'Bearer',
      'Curse_Seal', 'Curse', 'Seal', 'Level_2',
      'Six_Arms', 'Six', 'Arms',
      'Gold', 'Golden', 'Golden_Arrow',
      'Ambush', 'Hunt', 'Hunter',
    ],
  },
  {
    id: 'KS-127-RA', char: 'Sakon RA', num: 127,
    tags: ['R_ART'],
    names: ['Sakon', 'Sakon_Ukon'],
    words: [
      'Stone_Fist', 'Stone', 'Fist',
      'Sound_Four', 'Sound', 'Four', 'Bearer',
      'Black_Seal', 'Black', 'Seal',
      'Curse_Seal', 'Curse', 'Level_2',
      'Ukon', 'Twin', 'Twins', 'Brother',
      'Molecular', 'Possession', 'Molecular_Possession',
      'Parasite', 'Parasitic', 'Merge',
      'Weaken', 'Drain', 'Minus',
      'Demon', 'Ogre', 'Rashomon',
    ],
  },
  {
    id: 'KS-129-RA', char: 'Nine-Tails RA', num: 129,
    tags: ['R_ART'],
    names: [
      'Nine-Tails', 'NineTails', 'Nine_Tails', 'Kyubi', 'Kyuubi',
      'Kurama', 'Nine_Tailed', 'NineTailed', 'Fox', 'Demon_Fox',
    ],
    words: [
      'Demon_Fox_Cloak', 'Demon_Fox', 'Fox_Cloak', 'Demon', 'Cloak',
      'Tailed_Beast', 'Tailed', 'Beast', 'Bijuu',
      'Chakra_Cloak', 'Chakra', 'Red_Chakra', 'Red',
      'Jinchuriki', 'Host', 'Naruto',
      'Invincible', 'Indestructible', 'Unstoppable',
      'Rage', 'Fury', 'Wrath', 'Berserk',
      'Seal', 'Unsealed', 'Released', 'Unleashed',
      'Claw', 'Claws', 'Fang', 'Tail',
      'Shroud', 'Aura', 'Mantle',
      'Partial', 'Transformation', 'Trasformation',
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// URL GENERATION
// ═══════════════════════════════════════════════════════════════════════════
function generateUrls() {
  const urlSet = new Set();
  const items = [];

  function add(filename, cardId) {
    const u = BASE + filename + '-1920w.webp';
    if (!urlSet.has(u)) { urlSet.add(u); items.push({ url: u, card: cardId }); }
  }

  for (const card of TARGET_CARDS) {
    const num = card.num;
    const padNum = num < 10 ? `0${num}` : `${num}`;

    // Merge card-specific words with shared pool (deduped)
    const allWords = [...new Set([...card.words, ...SHARED_WORDS])];

    for (const tag of card.tags) {
      for (const name of card.names) {
        // ═══ A: Just name, no title word ═══
        add(`${num}_${tag}_${name}`, card.id);
        add(`${num}_${tag}_${name}_`, card.id);  // trailing underscore
        if (num < 100) add(`${padNum}_${tag}_${name}`, card.id);

        // ═══ B: 1-word suffix ═══
        for (const w of allWords) {
          add(`${num}_${tag}_${name}_${w}`, card.id);
        }

        // ═══ C: 2-word suffix (top 150 words) ═══
        const top150 = allWords.slice(0, 150);
        for (const w1 of top150) {
          for (const w2 of top150) {
            if (w1 === w2) continue;
            add(`${num}_${tag}_${name}_${w1}_${w2}`, card.id);
          }
        }

        // ═══ D: 3-word suffix (top 30 card-specific words only) ═══
        const top30 = card.words.slice(0, 30);
        for (const w1 of top30) {
          for (const w2 of top30) {
            if (w1 === w2) continue;
            for (const w3 of top30) {
              if (w3 === w1 || w3 === w2) continue;
              add(`${num}_${tag}_${name}_${w1}_${w2}_${w3}`, card.id);
            }
          }
        }
      }
    }

    // ═══ E: Hyphen in name (like Kabuto-Infiltrator) ═══
    const primaryTag = card.tags[0];
    const primaryName = card.names[0];
    for (const w of card.words) {
      add(`${num}_${primaryTag}_${primaryName}-${w}`, card.id);
    }

    // ═══ F: Lowercase variations ═══
    for (const w of card.words) {
      const lower = w.toLowerCase();
      if (lower !== w) {
        add(`${num}_${primaryTag}_${primaryName}_${lower}`, card.id);
      }
    }

    // ═══ G: Alternative tag formats ═══
    const altTags = ['R', 'UC', 'C', 'M', 'S', 'RA', 'MV', 'V', 'R_Art', 'R_art',
                     'Secret_Gold', 'SecretV_Gold', 'secret_GOLD', 'secretV_GOLD',
                     'Rare', 'Rare_Art', 'RareArt', 'Uncommon'];
    for (const altTag of altTags) {
      if (card.tags.includes(altTag)) continue;
      // Only primary name, card-specific words
      for (const w of card.words.slice(0, 20)) {
        add(`${num}_${altTag}_${primaryName}_${w}`, card.id);
      }
    }

    // ═══ H: No tag at all ═══
    for (const w of card.words) {
      add(`${num}_${primaryName}_${w}`, card.id);
    }

    // ═══ I: Sixty-FouR style caps quirk (for RA) ═══
    if (card.tags.includes('R_ART')) {
      for (const w of card.words) {
        // Capitalize last letter of last word segment
        if (w.length > 2 && /[a-z]$/.test(w)) {
          const quirked = w.slice(0, -1) + w.slice(-1).toUpperCase();
          add(`${num}_R_ART_${primaryName}_${quirked}`, card.id);
        }
      }
    }
  }

  return items;
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP ENGINE
// ═══════════════════════════════════════════════════════════════════════════
function headCheck(url) {
  return new Promise(resolve => {
    const req = https.request(url, { method: 'HEAD', agent, timeout: TIMEOUT_MS }, res => {
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
    https.get(url, { agent, timeout: 15000 }, res => {
      if (res.statusCode !== 200) { file.close(); try { fs.unlinkSync(dest); } catch {} return reject(new Error(`HTTP ${res.statusCode}`)); }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', err => { file.close(); try { fs.unlinkSync(dest); } catch {} reject(err); });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\n${C.bold}${C.cyan}  BRUTE20 - ALL MISSING CARDS MEGA HUNTER${C.reset}`);
  console.log(`${C.dim}  50K workers | 13 missing cards | millions of URLs${C.reset}\n`);

  console.log(`  ${C.bold}Target cards:${C.reset}`);
  for (const card of TARGET_CARDS) {
    console.log(`    ${C.yellow}${card.id}${C.reset} — ${card.char}`);
  }
  console.log('');

  const allUrls = generateUrls();
  const total = allUrls.length;
  console.log(`  ${C.bold}Total URLs: ${total.toLocaleString()}${C.reset}`);
  console.log(`  ${C.bold}Workers: ${Math.min(CONCURRENCY, total).toLocaleString()}${C.reset}\n`);

  const found = [];
  let tested = 0, errors = 0;
  const startTime = Date.now();
  let lastSave = Date.now();

  // Count per card
  const cardCounts = {};
  for (const item of allUrls) {
    cardCounts[item.card] = (cardCounts[item.card] || 0) + 1;
  }
  console.log(`  ${C.dim}URLs per card:${C.reset}`);
  for (const [cardId, count] of Object.entries(cardCounts)) {
    console.log(`    ${C.dim}${cardId}: ${count.toLocaleString()}${C.reset}`);
  }
  console.log('');

  function showProgress() {
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = elapsed > 0 ? (tested / elapsed).toFixed(0) : 0;
    const pct = ((tested / total) * 100).toFixed(1);
    const eta = rate > 0 ? ((total - tested) / rate).toFixed(0) : '?';
    process.stdout.write(
      `\r  ${tested.toLocaleString()}/${total.toLocaleString()} (${pct}%) | ${rate}/s | ETA ${eta}s | ${C.green}Found: ${found.length}${C.reset} | Err: ${errors}   `
    );
    if (Date.now() - lastSave > 30000) {
      lastSave = Date.now();
      try {
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
          tested, total, found: found.length, errors,
          elapsed: elapsed.toFixed(1),
          foundItems: found.map(f => ({ card: f.card, url: f.url, filename: f.filename })),
          completed: false,
        }, null, 2));
      } catch {}
    }
  }

  const pi = setInterval(showProgress, 500);

  let idx = 0;
  async function worker() {
    while (idx < allUrls.length) {
      const i = idx++;
      if (i >= allUrls.length) break;
      const item = allUrls[i];
      try {
        const size = await headCheck(item.url);
        if (size > 0) {
          const filename = item.url.split('/').pop();
          const sizeKB = (size / 1024).toFixed(1);
          process.stdout.write(
            `\n\n  ${C.bold}${C.green}!!! FOUND !!! [${item.card}]${C.reset}\n` +
            `  ${C.green}${filename} (${sizeKB} KB)${C.reset}\n` +
            `  ${C.dim}${item.url}${C.reset}\n\n`
          );
          const dest = path.join(OUT_DIR, filename);
          try {
            await downloadFile(item.url, dest);
            process.stdout.write(`  ${C.dim}-> Downloaded to ${dest}${C.reset}\n`);
          } catch (e) {
            process.stdout.write(`  ${C.yellow}-> Download failed: ${e.message}${C.reset}\n`);
          }
          found.push({ url: item.url, card: item.card, filename, size });
        }
      } catch { errors++; }
      tested++;
    }
  }

  const numW = Math.min(CONCURRENCY, total);
  const workers = [];
  for (let i = 0; i < numW; i++) workers.push(worker());
  await Promise.all(workers);

  clearInterval(pi);
  showProgress();
  console.log('\n');

  // ═══ REPORT ═══
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const report = [
    '='.repeat(70),
    'BRUTE20 - ALL MISSING CARDS MEGA HUNTER',
    `Date: ${new Date().toISOString()}`,
    '='.repeat(70), '',
    `URLs: ${total.toLocaleString()} | Time: ${elapsed}s | Workers: ${numW} | Errors: ${errors}`, '',
    'URLs per card:',
    ...Object.entries(cardCounts).map(([id, count]) => `  ${id}: ${count.toLocaleString()}`),
    '', `Found: ${found.length}`, '',
  ];

  if (found.length > 0) {
    report.push('FOUND IMAGES:', '-'.repeat(70));
    for (const f of found) {
      report.push(`  [${f.card}] ${f.filename} (${(f.size / 1024).toFixed(1)} KB)`);
      report.push(`    URL: ${f.url}`);
    }
  } else {
    report.push('No images found.');
  }
  report.push('', '='.repeat(70));
  fs.writeFileSync(REPORT_FILE, report.join('\n'), 'utf8');

  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
      tested, total, found: found.length, errors, elapsed,
      foundItems: found.map(f => ({ card: f.card, url: f.url, filename: f.filename })),
      completed: true,
    }, null, 2));
  } catch {}

  console.log(`${C.bold}  RESULTS${C.reset}`);
  console.log(`  Tested: ${total.toLocaleString()} in ${elapsed}s`);
  console.log(`  Found:  ${C.bold}${found.length > 0 ? C.green : C.red}${found.length}${C.reset}`);
  console.log(`  Report: ${REPORT_FILE}\n`);

  if (found.length > 0) {
    console.log(`${C.bold}${C.green}  FOUND:${C.reset}`);
    for (const f of found) {
      console.log(`    ${C.green}[${f.card}] ${f.filename} (${(f.size / 1024).toFixed(1)} KB)${C.reset}`);
    }
    console.log('');
  }

  agent.destroy();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
