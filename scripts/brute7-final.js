/**
 * brute7-final.js — Maximum coverage brute-force CDN image finder
 *
 * Phase 0: Try to scrape the actual gallery page for hidden image URLs
 * Phase 1-6: Systematic brute-force with 150 concurrent requests
 *
 * Loads previous progress from brute6_progress.json to skip already-tested URLs.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── Configuration ──────────────────────────────────────────────
const BASE_URLS = [
  'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/',
  'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/',
  'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/KS_',
  'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/Set1_',
];

const WIDTH_SUFFIXES = [
  '-1920w', '-1280w', '-960w', '-640w', '-480w', '-1600w', '-2048w',
  '-2560w', '-3840w', '-384w', '-256w', '-128w', '-3200w', '-4096w',
  '', // no suffix
];

const CONCURRENCY = 150;
const DELAY_MS = 5;
const TIMEOUT_MS = 5000;
const MIN_SIZE = 5000;

const agent = new https.Agent({ keepAlive: true, maxSockets: 200, maxFreeSockets: 50 });
const OUTPUT_DIR = path.join(__dirname, '..', 'newvisual');
const PROGRESS_FILE = path.join(OUTPUT_DIR, 'brute7_progress.json');
const OLD_PROGRESS = path.join(OUTPUT_DIR, 'brute6_progress.json');
const REPORT_FILE = path.join(OUTPUT_DIR, 'brute7_report.txt');

// ─── Analysis: ALL known CDN naming conventions ─────────────────
// From gallery + brute-force: how each card's CDN name maps to its data
//
// KEY PATTERNS DISCOVERED:
// - Hiruzen  -> "Professor" (nickname)
// - Tsunade  -> "Master" / "Hokage" / "Reserve-Seal"
// - Choji    -> "Chili_Pepper" (food pill! very creative)
// - Itachi   -> "Control" (from quote), "Akatsuki" (group), "Hunting" (action)
// - Naruto   -> "Rasengan" (technique), "Genin" (rank), "Original_Team" (context)
// - Sasuke   -> "Last" (?), "Sharingan" (ability), "Heaven_Curse_Mark" (power-up)
// - Kabuto   -> "Kabuto-Infiltrator" (hyphen between name and title!)
// - One-Tail -> "Partial_Trasformation" (typo on CDN!)
// - Names: sometimes first only (Naruto), sometimes compound (RockLee, MightGuy, KinTsuchi)
// - Jirobo spelling: "Jiroubou" (C) vs "Jirobo" (UC) — BOTH used!
//
// TITLE SOURCES: nickname, technique name, rank/role, food/item, quote keyword,
//                group affiliation, action verb, thematic descriptor

// ─── Missing Cards — ULTRA EXPANDED ─────────────────────────────
const MISSING_CARDS = [
  {
    num: 45,
    cardIds: ['KS-045-UC'],
    rarityPrefixes: ['UC', 'C', 'R', 'R_ART', 'RA'],
    names: ['Anko', 'Anko_Mitarashi', 'AnkoMitarashi', 'Mitarashi', 'Mitarashi_Anko'],
    titles: [
      // Technique names
      'Shadow_Snake', 'Snake_Hands', 'Shadow_Snake_Hands',
      'Striking_Shadow', 'Striking_Shadow_Snakes', 'Striking_Snakes',
      'Hidden_Shadow', 'Hidden_Shadow_Snake', 'Hidden_Shadow_Snake_Hands',
      'Sen_Ei', 'Sen_Ei_Jashu', 'Senei_Jashu', 'Senei', 'Jashu',
      'Many_Hidden_Shadow_Snake_Hands', 'Shadow_Snake_Hand',
      // Role/context
      'Proctor', 'Examiner', 'Special_Jonin', 'Jonin',
      'Forest_Death', 'Death_Forest', 'Forest_of_Death',
      'Second_Exam', 'Exam', 'Chunin_Exam',
      // Thematic
      'Snake', 'Snakes', 'Serpent', 'Serpents', 'Viper',
      'Snake_Strike', 'Snake_Fang', 'Snake_Attack', 'Snake_Assault',
      'Snake_Authority', 'Snake_Authority_Spear', 'Twin_Snake', 'Twin_Snakes',
      'Venomous', 'Poison', 'Venom', 'Toxic',
      'Cursed', 'Cursed_Seal', 'Cursed_Mark', 'Curse', 'Branded', 'Mark',
      'Heaven_Seal', 'Seal_of_Heaven', 'Curse_Mark',
      'Assassin', 'Ambush', 'Dangerous', 'Fierce', 'Deadly',
      'Dango', 'Sweet_Bean',
      // French
      'Poigne', 'Serpent_Spectral', 'Ombre', 'Serpent_Ombre',
      // hyphenated
      'Shadow-Snake', 'Snake-Hands', 'Shadow-Snake-Hands',
      'Sen-Ei-Jashu', 'Striking-Shadow-Snakes',
      // lowercase
      'shadow_snake', 'snake_hands', 'striking_shadow',
      'hidden_shadow', 'sen_ei_jashu',
      // Misc patterns from CDN
      'Multiple_Snakes', 'Dual_Snake', 'Snake_Hand',
    ],
  },
  {
    num: 115,
    cardIds: ['KS-115-R', 'KS-115-RA'],
    rarityPrefixes: ['R', 'R_ART', 'RA', 'UC'],
    names: ['Shino', 'Shino_Aburame', 'ShinoAburame', 'Aburame', 'Aburame_Shino'],
    titles: [
      // Technique names
      'Insect_Wall', 'Bug_Wall', 'Wall_of_Insects', 'Insect_Barrier',
      'Insect_Wall_Technique', 'Bug_Wall_Technique',
      'Insect_Dome', 'Bug_Dome', 'Insect_Sphere', 'Bug_Sphere',
      'Insect_Clone', 'Bug_Clone', 'Insect_Jar', 'Bug_Jar',
      'Parasitic_Wall', 'Parasitic_Destruction', 'Parasitic_Insects',
      'Hidden_Insect', 'Insect_Jamming', 'Bug_Jamming',
      'Destruction_Host', 'Host_Technique', 'Destruction_Bug',
      'Mushi', 'Kikaichuu', 'Kikaichu', 'Kikai',
      // Thematic
      'Swarm', 'Insect', 'Insects', 'Wall', 'Bug', 'Bugs',
      'Colony', 'Hive', 'Beetle', 'Beetles',
      'Bug_Shield', 'Bug_Barrier', 'Living_Wall',
      'Insect_Armor', 'Bug_Swarm', 'Infestation',
      'Shield', 'Barrier', 'Defense', 'Protection',
      'Aburame', 'Aburame_Technique', 'Insect_Pillar',
      'Sunglasses', 'Silent', 'Quiet', 'Stoic',
      // French
      'Mur_Insectes', 'Technique_Mur', 'Insecte',
      // lowercase + hyphenated
      'insect_wall', 'bug_wall', 'insect_dome', 'parasitic',
      'Insect-Wall', 'Bug-Wall', 'Bug-Dome',
    ],
  },
  {
    num: 116,
    cardIds: ['KS-116-RA'],
    rarityPrefixes: ['R_ART', 'RA', 'R'],
    names: ['Neji', 'Neji_Hyuga', 'NejiHyuga', 'Hyuga', 'Hyuga_Neji'],
    titles: [
      // Technique names
      'Eight_Trigrams', 'Sixty-Four_Palms', 'Sixty_Four_Palms',
      'Eight_Trigrams_64', 'Eight_Trigrams_Sixty-Four',
      'Hakke_64', 'Hakke_Rokujuyon', 'Hakke', 'Rokujuyon',
      '64_Palms', '64_palms', '64_Palms_Strike',
      // Ability
      'Gentle_Step', 'Gentle_fist', 'Gentle_Fist',
      'Palm_Rotation', 'Rotation', 'Byakugan',
      'Air_Palm', 'Vacuum_Palm', 'Divination',
      // Thematic
      'Guardian', 'Prodigy', 'Hyuga_Prodigy',
      'Destiny', 'Fate', 'Cage', 'Caged_Bird',
      'Branch_House', 'Main_House', 'Seal',
      'Genius', 'Gifted', 'Talented', 'Prodigal',
      'Trigrams', 'Palms', 'Strike',
      // French
      'Soixante-Quatre', 'Hakke_Paumes', 'Paumes',
      // lowercase + hyphenated
      'eight_trigrams', 'sixty_four_palms', 'gentle_fist',
      'Eight-Trigrams', 'Sixty-Four-Palms',
      'Sixty-Four', 'Eight-Trigrams-64',
    ],
  },
  {
    num: 122,
    cardIds: ['KS-122-R', 'KS-122-RA'],
    rarityPrefixes: ['R', 'R_ART', 'RA', 'UC'],
    names: ['Jirobo', 'Jiroubou', 'Jirobou', 'Jiroubô', 'Jirôbô'],
    titles: [
      // Technique
      'Arhat', 'Arhat_Fist', 'Arhat_fist',
      'Earth_Dome', 'Earth_Prison', 'Earth_Barrier',
      'Absorbing_Barrier', 'Chakra_Drain', 'Absorbing', 'Absorption',
      'Earth_Sphere', 'Sphere', 'Barrier',
      // Power-up
      'Cursed_Seal', 'Cursed_Seal_Level_2', 'Curse_Mark',
      'Level_Two', 'Level_2', 'Second_State', 'Stage_Two', 'Stage_2',
      'Transformation', 'Transformation_Level_2', 'Full_Power',
      // Thematic
      'Sound_Four', 'Sound_Ninja', 'Bearer',
      'Ogre', 'Golem', 'Rock', 'Boulder', 'Giant',
      'Fist', 'Power', 'Punch', 'Slam', 'Strength',
      'Body_Slam', 'Brute', 'Brute_Force', 'Rage',
      // French
      'Poing', 'Arhat_Poing', 'Dôme_Terre',
      // lowercase + hyphenated
      'arhat', 'arhat_fist', 'cursed_seal', 'earth_dome', 'fist',
      'Arhat-Fist', 'Cursed-Seal', 'Earth-Prison', 'Earth-Dome',
      'Level-Two', 'Sound-Four',
    ],
  },
  {
    num: 124,
    cardIds: ['KS-124-R', 'KS-124-RA'],
    rarityPrefixes: ['R', 'R_ART', 'RA', 'UC'],
    names: ['Kidomaru', 'Kidoumaru', 'Kidômaru'],
    titles: [
      // Technique
      'Spider_Bow', 'Fierce_Rip', 'Spider_Bow_Fierce',
      'Spider_Sticky', 'Spider_Sticky_Gold', 'Gold_Arrow', 'Golden_Arrow',
      'War_Bow', 'Bow', 'Arrow',
      'Kumoshibari', 'Kumo', 'Spider_Thread', 'Spider_Net',
      'Spider_Web', 'Web', 'Spider', 'Thread',
      // Power-up
      'Cursed_Seal', 'Level_Two', 'Level_2', 'Second_State', 'Stage_Two',
      'Sound_Four', 'Sound_Ninja',
      // Thematic
      'Bearer', 'Archer', 'Hunter', 'Predator',
      'Third_Eye', 'Six_Arms', 'Arms', 'Sticky',
      'Golden', 'Gold', 'Armor', 'Cocoon',
      // French
      'Arc_Araignee', 'Araignee', 'Dechirure',
      // lowercase + hyphenated
      'spider_bow', 'fierce_rip', 'gold_arrow', 'spider_web',
      'Spider-Bow', 'Fierce-Rip', 'Gold-Arrow', 'War-Bow',
      'Spider-Web', 'Spider-Thread',
    ],
  },
  {
    num: 126,
    cardIds: ['KS-126-R'],
    rarityPrefixes: ['R', 'R_ART', 'RA', 'UC'],
    names: ['Orochimaru'],
    titles: [
      // Technique
      'Summoning', 'Summoning_Jutsu', 'Snake_Summoning',
      'Manda', 'Manda_Summoning', 'Giant_Snake',
      'Triple_Rashomon', 'Rashomon', 'Formation',
      'Kusanagi', 'Grass_Cutter', 'Sword', 'Blade', 'Grass_Long_Sword',
      'Five_Pronged_Seal', 'Five_Pronged',
      'Living_Corpse', 'Body_Transfer', 'Transference',
      'Edo_Tensei', 'Reanimation',
      // Thematic
      'Snake', 'Snake_Lord', 'Snake_Master', 'Sannin',
      'Fear', 'Intimidation', 'Fury', 'Wrath', 'Threat',
      'Confrontation', 'Attack', 'Assault', 'Power',
      'Immortal', 'Forbidden', 'True_Form', 'True_Power',
      'Villain', 'Invasion', 'Forest',
      'Eight_Headed', 'Yamata', 'White_Snake',
      'Get_Out', 'Out_of_Way', 'Blocked', 'Obstacle',
      'Sound', 'Otokage', 'Lord',
      // Context from card title "Get out of my way"
      'Unstoppable', 'Path', 'Way', 'Fury', 'Rage', 'Obstacle',
      'Move', 'Force', 'Domination', 'Overwhelming',
      // French
      'Chemin', 'Otez', 'Invocation',
      // lowercase + hyphenated
      'summoning', 'manda', 'kusanagi', 'snake',
      'Snake-Summoning', 'Giant-Snake', 'Five-Pronged-Seal',
      'Get-Out', 'Living-Corpse', 'Body-Transfer', 'White-Snake',
      'True-Form', 'Triple-Rashomon',
    ],
  },
  {
    num: 127,
    cardIds: ['KS-127-R', 'KS-127-RA'],
    rarityPrefixes: ['R', 'R_ART', 'RA', 'UC'],
    names: ['Sakon', 'Sakon_Ukon', 'SakonUkon', 'Ukon', 'Ukon_Sakon'],
    titles: [
      // Technique
      'Stone_Fist', 'Stone_fist',
      'Tarenken', 'Multiple_Fist', 'Multiple_Connected_Fist',
      'Parasite', 'Demon_Parasite', 'Parasitic',
      'Molecular_Possession', 'Possession',
      'Black_Seal', 'Seal',
      // Power-up
      'Cursed_Seal', 'Cursed_Seal_Level_2', 'Curse_Mark',
      'Level_Two', 'Level_2', 'Second_State', 'Stage_Two',
      // Thematic
      'Merge', 'Combined', 'Combination', 'Fusion',
      'Ukon_Merge', 'Ukon', 'Twin', 'Twins', 'Brothers',
      'Sound_Four', 'Sound_Ninja', 'Bearer',
      'Combined_Attack', 'Punch', 'Fist', 'Power',
      'Demon', 'Ogre', 'Monster', 'Rashomon',
      // French
      'Poing_Pierre', 'Pierre',
      // lowercase + hyphenated
      'stone_fist', 'cursed_seal', 'merge', 'tarenken',
      'Stone-Fist', 'Cursed-Seal', 'Combined-Attack',
      'Multiple-Fist', 'Demon-Parasite',
    ],
  },
  {
    num: 129,
    cardIds: ['KS-129-R', 'KS-129-RA'],
    rarityPrefixes: ['R', 'R_ART', 'RA', 'M', 'M_Special', 'UC', 'Secret_GOLD', 'SecretV_GOLD'],
    names: [
      'Kyubi', 'Kyuubi', 'Nine-Tails', 'Nine_Tails', 'NineTails',
      'Naruto', 'Naruto_Kyubi', 'Naruto_Fox', 'Naruto_Uzumaki',
      'Kurama', 'Fox', 'Demon_Fox',
    ],
    titles: [
      // Technique/form
      'Demon_Fox', 'Demon_Fox_Cloak', 'Fox_Cloak',
      'Cloak', 'Fox_Mode', 'Red_Chakra', 'Red_Aura',
      'Tailed_Cloak', 'Chakra_Cloak', 'Bijuu_Cloak',
      'Jinchuuriki', 'Jinchuriki',
      // Transformation
      'Partial_Trasformation', 'Partial_Transformation',
      'Version_1', 'V1', 'Initial', 'Awakening',
      'One_Tail_Cloak', 'One-Tail_Cloak', 'Tail',
      // Thematic
      'Fox', 'Demon', 'Red', 'Rage', 'Rampage',
      'Beast', 'Beast_Cloak', 'Demon_Mantle',
      'Fury', 'Berserk', 'Feral', 'Wild',
      'Power', 'Unleashed', 'Released', 'Uncontrolled',
      'Chakra', 'Red_Chakra_Cloak', 'Crimson',
      'Seal', 'Broken_Seal', 'Seal_Break',
      'Nine-Tails_Cloak', 'Tailed_Beast',
      // French
      'Renard', 'Manteau', 'Demon_Renard',
      // lowercase + hyphenated
      'demon_fox', 'fox_cloak', 'red_chakra', 'jinchuriki',
      'Demon-Fox', 'Fox-Cloak', 'Red-Chakra', 'Nine-Tails-Cloak',
      'Bijuu-Cloak', 'Beast-Cloak',
    ],
  },
  {
    num: 130,
    cardIds: ['KS-130-R'],
    rarityPrefixes: ['R', 'R_ART', 'RA', 'M', 'M_Special', 'UC', 'Secret_GOLD', 'SecretV_GOLD'],
    names: [
      'One-Tail', 'One_Tail', 'OneTail', 'Ichibi',
      'Gaara', 'Gaara_Shukaku', 'Shukaku',
      'Gaara_One-Tail', 'Gaara_Ichibi',
    ],
    titles: [
      // Transformation (with known CDN typo!)
      'Full_Trasformation', 'Complete_Trasformation',
      'Full_Transformation', 'Complete_Transformation',
      'Trasformation', 'Transformation',
      // Thematic
      'Sand_Monster', 'Full_Beast', 'Sand_Demon',
      'Tanuki', 'Transform', 'Beast', 'Monster',
      'Sand_Spirit', 'Guardian_Spirit', 'Spirit',
      'Shukaku', 'Full_Shukaku', 'Awakened',
      'Possesion', 'Possession', 'Possessed',
      'Die', 'Ready_to_Die', 'Death', 'Kill',
      'Full', 'Demon', 'Jinchuuriki', 'Jinchuriki',
      'Sand', 'Sand_Form', 'Sand_Beast', 'Sand_Tanuki',
      'Rampage', 'Berserk', 'Unleashed', 'Released',
      'Giant', 'Colossal', 'Kaiju',
      // French
      'Transformation_Complete', 'Monstre_Sable',
      // lowercase + hyphenated
      'full_trasformation', 'full_transformation', 'sand_monster',
      'Full-Trasformation', 'Full-Transformation', 'Sand-Monster',
      'Sand-Beast', 'Sand-Demon', 'Full-Beast',
      'One-Tail_Full', 'One-Tail_Complete',
    ],
  },
  {
    num: 134,
    cardIds: ['KS-134-S'],
    rarityPrefixes: ['Secret_GOLD', 'SecretV_GOLD', 'S', 'Secret', 'SecretV', 'R', 'R_ART', 'M', 'M_Special'],
    names: [
      'Kyubi', 'Kyuubi', 'Nine-Tails', 'Nine_Tails', 'NineTails',
      'Nine-Tailed_Fox', 'Nine_Tailed_Fox', 'NineTailed',
      'Fox', 'Naruto', 'Kurama', 'Demon_Fox', 'Bijuu',
      'Naruto_Kyubi', 'Naruto_Fox', 'Naruto_Uzumaki',
    ],
    titles: [
      'Beast_Awakens', 'Awakens', 'Awakening', 'Destruction',
      'Giant_Fox', 'Full_Power', 'Unleashed',
      'Bijuu', 'Demon_Fox', 'Tailed_Beast',
      'Berserk', 'Rampage', 'Roar', 'Rage',
      'Beast_Bomb', 'Bijuu_Bomb', 'Bijuudama',
      'Full_Beast', 'Beast', 'Fox', 'Giant', 'Power',
      'Awakened', 'Released', 'Unbound', 'Free',
      'Nine_Tails', 'Tails', 'Demon', 'Monster',
      'Kaiju', 'Colossal', 'Massive', 'Overwhelming',
      'Seal_Break', 'Broken_Seal', 'Seal_Released',
      'Rasengan', 'Fury', 'Wrath',
      // French
      'Eveil', 'Destruction_Bete', 'Renard',
      // lowercase + hyphenated
      'beast_awakens', 'destruction', 'awakening', 'giant_fox',
      'Beast-Awakens', 'Full-Power', 'Demon-Fox',
      'Giant-Fox', 'Tailed-Beast', 'Bijuu-Bomb',
    ],
  },
  {
    num: 149,
    cardIds: ['KS-149-M'],
    rarityPrefixes: ['M', 'M_Special', 'MV', 'MV_Special', 'R', 'R_ART', 'Secret_GOLD', 'SecretV_GOLD'],
    names: ['Kiba', 'Kiba_Inuzuka', 'KibaInuzuka', 'Inuzuka', 'Inuzuka_Kiba'],
    titles: [
      'Fang', 'Fang_Over_Fang', 'Fang_over_Fang', 'Double_Fang',
      'Gatsuuga', 'Gatsuga', 'Tsuga',
      'Two-Headed', 'Two-Headed_Wolf', 'Two_Headed_Wolf',
      'Man_Beast', 'Man_Beast_Clone', 'Beast_Clone',
      'Wild', 'Wild_Fang', 'Piercing', 'Dynamic',
      'Double', 'Wolf', 'Wolves', 'Pack',
      'Akamaru', 'Duo', 'Combo', 'Partner',
      'All_Four', 'All_Fours', 'All_Four_Legs',
      'Tunneling', 'Tunneling_Fang', 'Passing_Fang',
      'Beast', 'Canine', 'Dog', 'Hound',
      'Rotation', 'Spinning', 'Drill', 'Claw',
      // French
      'Crocs', 'Crocs_sur_Crocs', 'Loup',
      // lowercase + hyphenated
      'fang', 'fang_over_fang', 'gatsuuga', 'double_fang',
      'Fang-Over-Fang', 'Two-Headed-Wolf', 'Man-Beast',
      'Man-Beast-Clone', 'Wild-Fang', 'Tunneling-Fang',
    ],
  },
  {
    num: 151,
    cardIds: ['KS-151-M'],
    rarityPrefixes: ['M', 'M_Special', 'MV', 'MV_Special', 'R', 'R_ART', 'Secret_GOLD', 'SecretV_GOLD'],
    names: ['RockLee', 'Rock_Lee', 'Lee', 'Rock', 'RockLee_'],
    titles: [
      'Loopy', 'Loopy_Fist', 'Loopy_fist',
      'Drunken', 'Drunken_Fist', 'Drunken_fist',
      'Suiken', 'Sake', 'Drunk', 'Intoxicated', 'Tipsy',
      'Zui', 'Zui_Ken', 'Zuiken',
      'Hidden_Lotus', 'Inner_Gate', 'Fifth_Gate',
      'Eight_Gate', 'Gate', 'Lotus', 'Gates',
      'Primary_Lotus', 'Reverse_Lotus', 'Front_Lotus', 'Rear_Lotus',
      'Training', 'Taijutsu', 'Youth', 'Springtime',
      'Fist', 'Master', 'Fighter', 'Speed',
      'Konoha_Whirlwind', 'Leaf_Whirlwind', 'Whirlwind',
      'Weights', 'Dropped_Weights', 'True_Speed',
      // French
      'Poing_Ivresse', 'Ivresse',
      // lowercase + hyphenated
      'loopy', 'loopy_fist', 'drunken_fist', 'suiken',
      'Loopy-Fist', 'Drunken-Fist', 'Hidden-Lotus', 'Inner-Gate',
      'Eight-Gate', 'Reverse-Lotus', 'Primary-Lotus',
    ],
  },
  {
    num: 152,
    cardIds: ['KS-152-M'],
    rarityPrefixes: ['M', 'M_Special', 'MV', 'MV_Special', 'R', 'R_ART', 'Secret_GOLD', 'SecretV_GOLD'],
    names: ['Itachi', 'Itachi_Uchiha', 'ItachiUchiha', 'Uchiha', 'Uchiha_Itachi'],
    titles: [
      'Amaterasu', 'Black_Flame', 'Black_Flames', 'Flames',
      'Mangekyo', 'Mangekyou', 'Mangekyo_Sharingan', 'Mangekyou_Sharingan',
      'Sharingan', 'Eye', 'Eternal', 'Eternal_Mangekyo',
      'Susanoo', 'Tsukuyomi', 'Genjutsu',
      'Fire', 'Fire_Style', 'Katon', 'Fireball',
      'Burning', 'Inextinguishable', 'Heavenly', 'Divine',
      'Illusion', 'Crow', 'Crows', 'Raven',
      'Hunting', 'Akatsuki', 'Rogue', 'Ninja',
      'Control', 'Domination', 'Master',
      'Izanami', 'Izanagi', 'Mirror',
      'Massacre', 'Clan', 'Prodigy', 'Genius',
      // French
      'Flammes_Noires', 'Flamme',
      // lowercase + hyphenated
      'amaterasu', 'black_flame', 'mangekyo', 'susanoo', 'tsukuyomi',
      'Black-Flame', 'Black-Flames', 'Mangekyo-Sharingan',
      'Eternal-Mangekyo', 'Fire-Style',
    ],
  },
  {
    num: 153,
    cardIds: ['KS-153-M'],
    rarityPrefixes: ['M', 'M_Special', 'MV', 'MV_Special', 'R', 'R_ART', 'Secret_GOLD', 'SecretV_GOLD'],
    names: ['Gaara', 'Gaara_of_the_Sand', 'Sabaku_no_Gaara'],
    titles: [
      'Sand_Burial', 'Sand_Coffin', 'Sand_Funeral',
      'Sabaku', 'Sabaku_Soso', 'Sabaku_Kyuu', 'Sabaku_Taiso',
      'Desert_Coffin', 'Desert_Funeral', 'Desert',
      'Sand_Waterfall', 'Sand_Tsunami', 'Sand_Wave', 'Sand_Avalanche',
      'Imperial_Funeral', 'Ultimate', 'Quicksand',
      'Kazekage', 'Absolute', 'Shield', 'Defense',
      'Sand', 'Burial', 'Funeral', 'Coffin',
      'Third_Eye', 'Gourd', 'Armor', 'Sand_Armor',
      'Sand_Prison', 'Sand_Binding', 'Sand_Storm',
      'Crushing', 'Graveyard', 'Tomb',
      // French
      'Cercueil_Sable', 'Sable', 'Cercueil', 'Tombeau',
      // lowercase + hyphenated
      'sand_burial', 'sand_coffin', 'sabaku', 'sand_funeral',
      'Sand-Burial', 'Sand-Coffin', 'Sand-Funeral', 'Sand-Tsunami',
      'Sand-Waterfall', 'Sand-Prison', 'Imperial-Funeral',
    ],
  },
];

// ─── Progress ───────────────────────────────────────────────────
let progress = { testedCount: 0, found: [], startedAt: new Date().toISOString() };
let testedSet = new Set();
let interrupted = false;

function loadProgress() {
  // First load old brute6 progress
  try {
    if (fs.existsSync(OLD_PROGRESS)) {
      const data = JSON.parse(fs.readFileSync(OLD_PROGRESS, 'utf-8'));
      (data.tested || []).forEach(u => testedSet.add(u));
      console.log(`  Loaded ${testedSet.size} URLs from brute6 progress`);
    }
  } catch (e) {}

  // Then load our own progress
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
      (data.tested || []).forEach(u => testedSet.add(u));
      progress.found = data.found || [];
      console.log(`  Loaded brute7 progress — total: ${testedSet.size} URLs, ${progress.found.length} found`);
    }
  } catch (e) {}

  progress.testedCount = testedSet.size;
}

function saveProgress() {
  // Only save NEW URLs (not the old ones — too large)
  const newTested = [...testedSet].slice(-50000); // last 50K for resume
  const data = {
    tested: newTested,
    found: progress.found,
    testedCount: testedSet.size,
    startedAt: progress.startedAt,
    lastSavedAt: new Date().toISOString(),
  };
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data));
}

// ─── HTTP ───────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function checkUrl(url) {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url);
      const req = https.request({
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname,
        method: 'HEAD',
        timeout: TIMEOUT_MS,
        agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'image/webp,image/*,*/*;q=0.8',
          'Referer': 'https://www.narutotcgmythos.com/',
        },
      }, (res) => {
        res.resume();
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          checkUrl(res.headers.location).then(resolve);
          return;
        }
        const size = parseInt(res.headers['content-length'] || '0', 10);
        resolve({ url, status: res.statusCode, size });
      });
      req.on('error', () => resolve({ url, status: 0, size: 0 }));
      req.on('timeout', () => { req.destroy(); resolve({ url, status: 0, size: 0 }); });
      req.end();
    } catch (e) {
      resolve({ url, status: 0, size: 0 });
    }
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        try { fs.unlinkSync(destPath); } catch(e) {}
        downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(destPath); } catch(e) {}
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', (err) => { try { fs.unlinkSync(destPath); } catch(e) {} reject(err); });
    }).on('error', (err) => { file.close(); try { fs.unlinkSync(destPath); } catch(e) {} reject(err); });
  });
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchPage(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

// ─── URL Generation ─────────────────────────────────────────────
function generateAllCandidates(card) {
  const urls = new Set();
  const numFormats = [
    String(card.num),
    String(card.num).padStart(2, '0'),
    String(card.num).padStart(3, '0'),
  ];

  const add = (base, num, rarity, name, title, w, ext) => {
    const fn = title ? `${num}_${rarity}_${name}_${title}` : `${num}_${rarity}_${name}`;
    urls.add(`${base}${fn}${w}${ext}`);
  };

  // Also try "Kabuto-Infiltrator" style (hyphen between name-title, no underscore)
  const addHyphenStyle = (base, num, rarity, name, title, w, ext) => {
    if (!title) return;
    urls.add(`${base}${num}_${rarity}_${name}-${title}${w}${ext}`);
  };

  for (const base of BASE_URLS) {
    for (const num of numFormats) {
      for (const rarity of card.rarityPrefixes) {
        for (const name of card.names) {
          for (const title of card.titles) {
            for (const w of WIDTH_SUFFIXES) {
              add(base, num, rarity, name, title, w, '.webp');
              addHyphenStyle(base, num, rarity, name, title, w, '.webp');
            }
            // jpg/png for key widths only
            for (const w of ['-1920w', '-960w', '-640w', '']) {
              add(base, num, rarity, name, title, w, '.jpg');
              add(base, num, rarity, name, title, w, '.png');
              addHyphenStyle(base, num, rarity, name, title, w, '.jpg');
              addHyphenStyle(base, num, rarity, name, title, w, '.png');
            }
          }
          // Without title
          for (const w of WIDTH_SUFFIXES) {
            add(base, num, rarity, name, null, w, '.webp');
          }
          for (const w of ['-1920w', '-960w', '']) {
            add(base, num, rarity, name, null, w, '.jpg');
            add(base, num, rarity, name, null, w, '.png');
          }
        }
      }
    }
  }

  // Wildcard rarity prefixes
  const allRarities = ['C', 'UC', 'R', 'R_ART', 'RA', 'M', 'M_Special', 'MV', 'MV_Special',
    'Secret_GOLD', 'SecretV_GOLD', 'S', 'Secret', 'SecretV', 'L', 'Legendary'];
  for (const num of numFormats) {
    for (const rarity of allRarities) {
      if (card.rarityPrefixes.includes(rarity)) continue;
      for (const name of card.names.slice(0, 3)) {
        for (const w of ['-1920w', '-960w', '']) {
          add(BASE_URLS[0], num, rarity, name, null, w, '.webp');
        }
      }
    }
  }

  return [...urls].filter(u => !testedSet.has(u));
}

// ─── Phase 0: Scrape gallery page ──────────────────────────────
async function scrapeGallery() {
  console.log('\n--- PHASE 0: Scraping gallery page ---\n');

  const galleryUrls = [
    'https://www.narutotcgmythos.com/fr/galerie',
    'https://www.narutotcgmythos.com/en/gallery',
    'https://www.narutotcgmythos.com/galerie',
    'https://www.narutotcgmythos.com/gallery',
  ];

  const foundUrls = new Set();

  for (const url of galleryUrls) {
    try {
      console.log(`  Trying ${url}...`);
      const result = await fetchPage(url);
      if (result.status === 200 && result.body.length > 1000) {
        console.log(`  Got ${result.body.length} bytes`);
        // Extract all CDN image URLs
        const matches = result.body.match(/https?:\/\/lirp\.cdn-website\.com\/[^"'\s)]+\.(?:webp|jpg|png)/gi);
        if (matches) {
          matches.forEach(u => foundUrls.add(u));
          console.log(`  Found ${matches.length} CDN image URLs`);
        }
        // Also extract any src= or data-src= image paths
        const srcMatches = result.body.match(/(?:src|data-src)="([^"]*(?:webp|jpg|png)[^"]*)"/gi);
        if (srcMatches) {
          console.log(`  Found ${srcMatches.length} src attributes`);
        }
      } else {
        console.log(`  Status ${result.status}, ${result.body.length} bytes`);
      }
    } catch (e) {
      console.log(`  Failed: ${e.message}`);
    }
  }

  if (foundUrls.size > 0) {
    console.log(`\n  Total unique CDN URLs from gallery: ${foundUrls.size}`);
    // Check each for our missing cards
    const missingNums = new Set(MISSING_CARDS.map(c => c.num));
    for (const url of foundUrls) {
      const match = url.match(/\/(\d+)_/);
      if (match && missingNums.has(parseInt(match[1]))) {
        console.log(`  >>> GALLERY HIT: ${url}`);
      }
    }
  }

  return foundUrls;
}

// ─── Worker ─────────────────────────────────────────────────────
async function processCard(card, foundCardIds, stats) {
  if (card.cardIds.every(id => foundCardIds.has(id))) {
    console.log(`  [SKIP] Card ${card.num} — already found`);
    return;
  }

  const candidates = generateAllCandidates(card);
  if (candidates.length === 0) {
    console.log(`  [SKIP] Card ${card.num} — 0 new URLs`);
    return;
  }

  console.log(`  [START] Card ${card.num} (${card.cardIds.join(', ')}): ${candidates.length} URLs`);

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    if (interrupted || card.cardIds.every(id => foundCardIds.has(id))) return;

    const batch = candidates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(checkUrl));

    for (const r of results) {
      testedSet.add(r.url);
      stats.tested++;

      if (r.status === 200 && r.size > MIN_SIZE) {
        const filename = r.url.split('/').pop();
        console.log(`\n  >>> FOUND: ${filename} (${(r.size / 1024).toFixed(1)} KB)`);
        console.log(`      URL: ${r.url}\n`);

        for (const cardId of card.cardIds) {
          if (foundCardIds.has(cardId)) continue;
          const ext = path.extname(filename) || '.webp';
          const destPath = path.join(OUTPUT_DIR, `${cardId}${ext}`);
          try {
            await downloadFile(r.url, destPath);
            const stat = fs.statSync(destPath);
            console.log(`      Downloaded: ${cardId} (${(stat.size / 1024).toFixed(1)} KB)`);
            progress.found.push({ cardId, url: r.url, size: stat.size, filename });
            foundCardIds.add(cardId);
            stats.found++;
          } catch (err) {
            console.log(`      Download failed for ${cardId}: ${err.message}`);
          }
        }
        saveProgress();
        return;
      }
    }

    if (i > 0 && (i / CONCURRENCY) % 30 === 0) {
      process.stdout.write(`    Card ${card.num}: ${i}/${candidates.length} (global: ${stats.tested} tested, ${stats.found} found)\r`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`  [DONE] Card ${card.num} — not found (${candidates.length} new tested)`);
}

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('\n============================================');
  console.log('  BRUTE7-FINAL: Maximum Coverage Finder');
  console.log(`  ${CONCURRENCY} concurrent requests per worker`);
  console.log(`  ${MISSING_CARDS.length} cards to search`);
  console.log('============================================');

  loadProgress();

  const foundCardIds = new Set((progress.found || []).map(f => f.cardId));

  // Phase 0: Try scraping the gallery page
  await scrapeGallery();

  const stats = { tested: testedSet.size, found: progress.found ? progress.found.length : 0 };

  console.log(`\n--- BRUTE FORCE: ${MISSING_CARDS.length} cards in parallel ---\n`);

  // All cards in parallel
  await Promise.all(MISSING_CARDS.map(card => processCard(card, foundCardIds, stats)));

  saveProgress();

  // Report
  const report = [
    '========================================',
    '  BRUTE7-FINAL: Report',
    '========================================',
    '',
    `Started: ${progress.startedAt}`,
    `Finished: ${new Date().toISOString()}`,
    `Total URLs tested (all runs): ${testedSet.size}`,
    `New images found: ${stats.found}`,
    '',
    '--- Found Images ---',
    ...(progress.found || []).map(f => `  ${f.cardId} -> ${f.url} (${(f.size / 1024).toFixed(1)} KB)`),
    '',
    '--- Still Missing ---',
    ...MISSING_CARDS.filter(c => !c.cardIds.every(id => foundCardIds.has(id)))
      .map(c => `  ${c.cardIds.join(', ')} — ${c.names[0]}`),
    '',
  ].join('\n');

  fs.writeFileSync(REPORT_FILE, report);
  console.log('\n' + report);
  console.log(`Report saved to: ${REPORT_FILE}`);

  // Update text files
  const allFound = [
    { cardId: 'KS-108-R', url: 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/108_R_Naruto_Rasengan-1920w.webp' },
    { cardId: 'KS-112-R', url: 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/112_R_Choji_Chili_Pepper-1920w.webp' },
    { cardId: 'KS-128-R', url: 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/128_R_Itachi_Control-1920w.webp' },
    { cardId: 'KS-145-M', url: 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/145_M_Naruto_Original_Team-1920w.webp' },
    ...(progress.found || []).map(f => ({ cardId: f.cardId, url: f.url })),
  ];

  // Deduplicate
  const seen = new Set();
  const uniqueFound = allFound.filter(f => { if (seen.has(f.cardId)) return false; seen.add(f.cardId); return true; });

  fs.writeFileSync(path.join(OUTPUT_DIR, 'found_missing_urls.txt'),
    uniqueFound.map(f => `${f.cardId} | ${f.url}`).join('\n') + '\n');

  const allMissingIds = MISSING_CARDS.flatMap(c => c.cardIds);
  const stillMissing = allMissingIds.filter(id => !seen.has(id));
  const cardDataMap = {};
  MISSING_CARDS.forEach(c => c.cardIds.forEach(id => cardDataMap[id] = c));

  const missingLines = stillMissing.map(id => {
    const c = cardDataMap[id];
    return `${id} — ${c.names[0]}`;
  });

  fs.writeFileSync(path.join(OUTPUT_DIR, 'not_found_cards.txt'),
    `Cards NOT found on CDN (brute-force failed across 7 scripts, ${testedSet.size}+ URL combinations):\n\n` +
    missingLines.join('\n') +
    `\n\n${stillMissing.length} cards remaining. These are likely not yet uploaded to the CDN.\n`);
}

process.on('SIGINT', () => {
  console.log('\n\nInterrupted! Saving...');
  interrupted = true;
  saveProgress();
  setTimeout(() => process.exit(0), 1000);
});

main().catch(err => {
  console.error('Fatal error:', err);
  saveProgress();
  process.exit(1);
});
