/**
 * brute6-ultimate.js — Ultra-fast parallel brute-force CDN image finder
 *
 * Uses multiple parallel worker pools to maximize throughput.
 * ~50 concurrent HTTP requests across all cards simultaneously.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ─── Configuration ──────────────────────────────────────────────
const BASE_URLS = [
  'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/',
  'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/',
];

const WIDTH_SUFFIXES = [
  '-1920w', '-1280w', '-960w', '-640w', '-480w', '-1600w', '-2048w',
  '-2560w', '-3840w', '-384w', '-256w', '-128w',
  '', // no width suffix
];

const FILE_EXTENSIONS = ['.webp', '.jpg', '.png'];

// SPEED: 50 concurrent requests, minimal delay
const CONCURRENCY = 50;
const DELAY_MS = 10;   // minimal delay between batches
const TIMEOUT_MS = 6000;
const MIN_SIZE = 5000;

// Use HTTP Agent with keep-alive for connection reuse
const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 60,
  maxFreeSockets: 20,
});

const OUTPUT_DIR = path.join(__dirname, '..', 'newvisual');
const PROGRESS_FILE = path.join(OUTPUT_DIR, 'brute6_progress.json');
const REPORT_FILE = path.join(OUTPUT_DIR, 'brute6_report.txt');

// ─── Missing Cards Data ─────────────────────────────────────────
const MISSING_CARDS = [
  {
    num: 45,
    cardIds: ['KS-045-UC'],
    rarityPrefixes: ['UC'],
    names: ['Anko', 'Anko_Mitarashi', 'AnkoMitarashi'],
    titles: [
      'Shadow_Snake', 'Snake_Hands', 'Shadow_Snake_Hands',
      'Sen_Ei', 'Sen_Ei_Jashu', 'Senei_Jashu', 'Jashu',
      'Striking_Shadow', 'Hidden_Shadow', 'Hidden_Shadow_Snake',
      'Snake_Strike', 'Snake_Fang', 'Venomous', 'Viper',
      'Multiple_Snakes', 'Snake_Assault', 'Dual_Snake',
      'Shadow_Snake_Hand', 'Snake_Hand',
      'Cursed_Seal', 'Forest_Death', 'Death_Forest',
      'Assassin', 'Ambush', 'Dangerous', 'Proctor',
      'Special_Jonin', 'Jonin', 'Examiner',
      'Serpent', 'Serpent_Spectral', 'Poigne',
      'Snakes', 'Serpents', 'Snake', 'Shadow',
      'shadow_snake', 'snake_hands', 'shadow_snake_hands',
      'Shadow-Snake', 'Snake-Hands', 'Shadow-Snake-Hands',
      'Sen-Ei-Jashu', 'Hidden-Shadow-Snake',
    ],
  },
  {
    num: 115,
    cardIds: ['KS-115-R', 'KS-115-RA'],
    rarityPrefixes: ['R', 'R_ART'],
    names: ['Shino', 'Shino_Aburame', 'ShinoAburame'],
    titles: [
      'Insect_Wall', 'Bug_Wall', 'Wall_of_Insects',
      'Insect_Wall_Technique', 'Bug_Wall_Technique',
      'Insect_Dome', 'Bug_Dome', 'Insect_Sphere', 'Bug_Sphere',
      'Insect_Clone', 'Bug_Clone', 'Insect_Jar', 'Bug_Jar',
      'Parasitic_Wall', 'Parasitic_Destruction',
      'Hidden_Insect', 'Insect_Jamming', 'Bug_Jamming',
      'Destruction_Host', 'Host_Technique',
      'Mushi', 'Kikaichuu', 'Kikaichu',
      'Aburame_Technique', 'Insect_Pillar',
      'Swarm', 'Insect', 'Wall', 'Bug',
      'insect_wall', 'bug_wall', 'insect_dome',
      'Insect-Wall', 'Bug-Wall',
    ],
  },
  {
    num: 116,
    cardIds: ['KS-116-RA'],
    // ONLY R_ART — the user already has KS-116-R
    rarityPrefixes: ['R_ART'],
    names: ['Neji', 'Neji_Hyuga', 'NejiHyuga'],
    titles: [
      'Eight_Trigrams', 'Sixty-Four_Palms', 'Sixty_Four_Palms',
      'Eight_Trigrams_64', 'Eight_Trigrams_Sixty-Four',
      'Hakke_64', 'Hakke_Rokujuyon', 'Hakke',
      'Rokujuyon', '64_Palms', '64_palms',
      'Gentle_Step', 'Gentle_fist', 'Gentle_Fist',
      'Guardian', 'Prodigy', 'Hyuga_Prodigy',
      'Palm_Strike', 'Air_Palm', 'Vacuum_Palm',
      'Divination', 'Rotation', 'Trigrams',
      '64_Palms_Strike', 'Eight_trigrams',
      'eight_trigrams', 'sixty_four_palms', 'gentle_fist',
      'Eight-Trigrams', 'Sixty-Four-Palms', 'Gentle-Fist',
    ],
  },
  {
    num: 122,
    cardIds: ['KS-122-R', 'KS-122-RA'],
    rarityPrefixes: ['R', 'R_ART'],
    names: ['Jirobo', 'Jiroubou', 'Jirobou'],
    titles: [
      'Arhat', 'Arhat_Fist', 'arhat_fist',
      'Cursed_Seal', 'Cursed_Seal_Level_2', 'Curse_Mark',
      'Level_Two', 'Second_State', 'Stage_Two',
      'Full_Power', 'Sound_Four',
      'Ogre', 'Earth_Prison', 'Earth_Dome',
      'Absorbing_Barrier', 'Chakra_Drain', 'Absorbing',
      'Sphere', 'Earth_Sphere', 'Barrier',
      'Transformation', 'Transformation_Level_2',
      'Bearer', 'Fist', 'Power', 'Punch',
      'arhat', 'cursed_seal', 'earth_dome', 'fist',
      'Arhat-Fist', 'Cursed-Seal', 'Earth-Prison',
    ],
  },
  {
    num: 124,
    cardIds: ['KS-124-R', 'KS-124-RA'],
    rarityPrefixes: ['R', 'R_ART'],
    names: ['Kidomaru', 'Kidoumaru'],
    titles: [
      'Spider_Bow', 'Fierce_Rip', 'Spider_Bow_Fierce',
      'Spider_Sticky', 'Spider_Sticky_Gold', 'Gold_Arrow',
      'War_Bow', 'Bow', 'Arrow',
      'Kumoshibari', 'Kumo', 'Spider_Thread', 'Spider_Net',
      'Cursed_Seal', 'Level_Two', 'Second_State', 'Stage_Two',
      'Sound_Four', 'Bearer', 'Spider',
      'Golden_Arrow', 'Web', 'Spider_Web',
      'spider_bow', 'fierce_rip', 'gold_arrow',
      'Spider-Bow', 'Fierce-Rip', 'Gold-Arrow', 'War-Bow',
    ],
  },
  {
    num: 126,
    cardIds: ['KS-126-R'],
    rarityPrefixes: ['R', 'R_ART'],
    names: ['Orochimaru'],
    titles: [
      'Summoning', 'Summoning_Jutsu', 'Snake_Summoning',
      'Manda', 'Manda_Summoning', 'Giant_Snake',
      'Giant_Snake_Summoning', 'Triple_Rashomon',
      'Kusanagi', 'Grass_Cutter', 'Sword', 'Blade',
      'Five_Pronged_Seal', 'Five_Pronged',
      'Fear', 'Intimidation', 'Fury', 'Wrath',
      'Threat', 'Confrontation', 'Attack', 'Assault',
      'Snake_Lord', 'Snake_Master', 'True_Power',
      'Formation', 'Rashomon', 'Shadow',
      'Power', 'Immortal', 'Forbidden',
      'Get_Out', 'Out_of_Way', 'Villain',
      'Reanimation', 'Edo_Tensei', 'Living_Corpse',
      'Body_Transfer', 'Transference', 'Sannin',
      'True_Form', 'Eight_Headed', 'Yamata',
      'summoning', 'manda', 'kusanagi', 'snake_lord',
      'Snake-Summoning', 'Giant-Snake', 'Five-Pronged-Seal',
      'Get-Out', 'Living-Corpse', 'Body-Transfer',
    ],
  },
  {
    num: 127,
    cardIds: ['KS-127-R', 'KS-127-RA'],
    rarityPrefixes: ['R', 'R_ART'],
    names: ['Sakon', 'Sakon_Ukon'],
    titles: [
      'Stone_Fist', 'Stone_fist', 'stone_fist',
      'Cursed_Seal', 'Cursed_Seal_Level_2', 'Curse_Mark',
      'Level_Two', 'Second_State', 'Stage_Two',
      'Merge', 'Combined', 'Combination',
      'Ukon_Merge', 'Ukon', 'Twin',
      'Sound_Four', 'Combined_Attack', 'Punch',
      'Tarenken', 'Multiple_Fist', 'Multiple_Connected_Fist',
      'Parasite', 'Demon_Parasite', 'Parasitic',
      'Bearer', 'Fist', 'Power',
      'stone_fist', 'cursed_seal', 'merge',
      'Stone-Fist', 'Cursed-Seal', 'Combined-Attack',
    ],
  },
  {
    num: 129,
    cardIds: ['KS-129-R', 'KS-129-RA'],
    rarityPrefixes: ['R', 'R_ART', 'M', 'M_Special'],
    names: [
      'Kyubi', 'Kyuubi', 'Nine-Tails', 'Nine_Tails', 'NineTails',
      'Naruto', 'Naruto_Kyubi', 'Naruto_Fox',
    ],
    titles: [
      'Demon_Fox', 'Demon_Fox_Cloak', 'Fox_Cloak',
      'Cloak', 'Fox_Mode', 'Red_Chakra', 'Red_Aura',
      'Jinchuuriki', 'Jinchuriki', 'Bijuu_Cloak', 'Bijuu',
      'Beast_Cloak', 'Demon_Mantle', 'Tailed_Cloak',
      'Version_1', 'V1', 'Initial',
      'Partial_Trasformation', 'Partial_Transformation',
      'Fox', 'Demon', 'Red',
      'Nine-Tails_Cloak', 'Chakra_Cloak',
      'demon_fox', 'fox_cloak', 'red_chakra',
      'Demon-Fox', 'Fox-Cloak', 'Red-Chakra', 'Nine-Tails-Cloak',
    ],
  },
  {
    num: 130,
    cardIds: ['KS-130-R'],
    rarityPrefixes: ['R', 'R_ART', 'M', 'M_Special'],
    names: [
      'One-Tail', 'One_Tail', 'OneTail', 'Ichibi',
      'Gaara', 'Gaara_Shukaku', 'Shukaku',
    ],
    titles: [
      'Full_Trasformation', 'Complete_Trasformation',
      'Full_Transformation', 'Complete_Transformation',
      'Sand_Monster', 'Full_Beast', 'Sand_Demon',
      'Tanuki', 'Transform', 'Beast',
      'Sand_Spirit', 'Guardian_Spirit',
      'Possesion', 'Possession',
      'Shukaku', 'Full_Shukaku',
      'Die', 'Ready_to_Die', 'Death',
      'Jinchuuriki', 'Jinchuriki',
      'Full', 'Monster', 'Demon',
      'full_trasformation', 'full_transformation', 'sand_monster',
      'Full-Trasformation', 'Full-Transformation', 'Sand-Monster',
    ],
  },
  {
    num: 134,
    cardIds: ['KS-134-S'],
    rarityPrefixes: ['Secret_GOLD', 'SecretV_GOLD', 'S', 'Secret', 'SecretV'],
    names: [
      'Kyubi', 'Kyuubi', 'Nine-Tails', 'Nine_Tails',
      'Nine-Tailed_Fox', 'Nine_Tailed_Fox', 'NineTails',
      'Fox', 'Naruto',
    ],
    titles: [
      'Beast_Awakens', 'Awakens', 'Awakening', 'Destruction',
      'Giant_Fox', 'Full_Power', 'Unleashed',
      'Bijuu', 'Demon_Fox', 'Tailed_Beast',
      'Berserk', 'Rampage', 'Roar',
      'Beast_Bomb', 'Bijuu_Bomb', 'Bijuudama',
      'Full_Beast', 'Beast', 'Fox',
      'Giant', 'Rage', 'Power',
      'beast_awakens', 'destruction', 'awakening',
      'Beast-Awakens', 'Full-Power', 'Demon-Fox',
    ],
  },
  {
    num: 149,
    cardIds: ['KS-149-M'],
    rarityPrefixes: ['M', 'M_Special', 'MV', 'MV_Special'],
    names: ['Kiba', 'Kiba_Inuzuka', 'KibaInuzuka'],
    titles: [
      'Fang', 'Fang_Over_Fang', 'Fang_over_Fang',
      'Gatsuuga', 'Gatsuga', 'Tsuga',
      'Two-Headed', 'Two-Headed_Wolf', 'Two_Headed_Wolf',
      'Man_Beast', 'Man_Beast_Clone', 'Beast_Clone',
      'Wild', 'Wild_Fang', 'Piercing',
      'Dynamic', 'Double', 'Double_Fang',
      'Wolf', 'Akamaru', 'Duo', 'Combo',
      'All_Four', 'All_Fours', 'Tunneling',
      'Tunneling_Fang', 'Passing_Fang',
      'fang', 'fang_over_fang', 'gatsuuga',
      'Fang-Over-Fang', 'Two-Headed-Wolf', 'Man-Beast',
    ],
  },
  {
    num: 151,
    cardIds: ['KS-151-M'],
    rarityPrefixes: ['M', 'M_Special', 'MV', 'MV_Special'],
    names: ['RockLee', 'Rock_Lee', 'Lee'],
    titles: [
      'Loopy', 'Loopy_Fist', 'Loopy_fist',
      'Drunken', 'Drunken_Fist', 'Drunken_fist',
      'Suiken', 'Sake', 'Drunk', 'Intoxicated', 'Tipsy',
      'Zui', 'Zui_Ken',
      'Hidden_Lotus', 'Inner_Gate', 'Fifth_Gate',
      'Eight_Gate', 'Gate', 'Lotus',
      'Primary_Lotus', 'Reverse_Lotus',
      'Training', 'Taijutsu', 'Youth',
      'Fist', 'Master',
      'loopy', 'loopy_fist', 'drunken_fist', 'suiken',
      'Loopy-Fist', 'Drunken-Fist', 'Hidden-Lotus', 'Inner-Gate',
    ],
  },
  {
    num: 152,
    cardIds: ['KS-152-M'],
    rarityPrefixes: ['M', 'M_Special', 'MV', 'MV_Special'],
    names: ['Itachi', 'Itachi_Uchiha', 'ItachiUchiha'],
    titles: [
      'Amaterasu', 'Black_Flame', 'Black_Flames', 'Flames',
      'Mangekyo', 'Mangekyou', 'Mangekyo_Sharingan',
      'Sharingan', 'Eye', 'Eternal',
      'Susanoo', 'Tsukuyomi',
      'Fire', 'Fire_Style', 'Katon', 'Fireball',
      'Burning', 'Inextinguishable', 'Heavenly',
      'Genjutsu', 'Illusion', 'Crow',
      'Hunting', 'Akatsuki', 'Rogue',
      'amaterasu', 'black_flame', 'mangekyo', 'susanoo',
      'Black-Flame', 'Black-Flames', 'Mangekyo-Sharingan',
    ],
  },
  {
    num: 153,
    cardIds: ['KS-153-M'],
    rarityPrefixes: ['M', 'M_Special', 'MV', 'MV_Special'],
    names: ['Gaara'],
    titles: [
      'Sand_Burial', 'Sand_Coffin', 'Sand_Funeral',
      'Sabaku', 'Sabaku_Soso', 'Sabaku_Kyuu',
      'Desert_Coffin', 'Desert_Funeral', 'Desert',
      'Sand_Waterfall', 'Sand_Tsunami', 'Sand_Wave',
      'Imperial_Funeral', 'Ultimate', 'Quicksand',
      'Kazekage', 'Absolute', 'Shield',
      'Sand', 'Burial', 'Funeral', 'Coffin',
      'Third_Eye', 'Gourd', 'Armor',
      'sand_burial', 'sand_coffin', 'sabaku',
      'Sand-Burial', 'Sand-Coffin', 'Sand-Funeral', 'Sand-Tsunami',
    ],
  },
];

// ─── Progress Management ────────────────────────────────────────
let progress = { testedCount: 0, found: [], startedAt: new Date().toISOString() };
let testedSet = new Set();
let interrupted = false;

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
      testedSet = new Set(data.tested || []);
      progress = { ...progress, ...data, testedCount: testedSet.size };
      console.log(`Resumed: ${testedSet.size} URLs already tested, ${(progress.found || []).length} found`);
    }
  } catch (e) {
    console.log('No valid progress file, starting fresh.');
  }
}

function saveProgress() {
  const data = {
    tested: [...testedSet],
    found: progress.found,
    testedCount: testedSet.size,
    startedAt: progress.startedAt,
    lastSavedAt: new Date().toISOString(),
  };
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data));
}

// ─── HTTP Utilities ─────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function checkUrl(url) {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const req = https.request({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname,
      method: 'HEAD',
      timeout: TIMEOUT_MS,
      agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/avif,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://www.narutotcgmythos.com/',
      },
    }, (res) => {
      // Consume response to free socket
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
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, {
      agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    }, (res) => {
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
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(destPath); } catch(e) {}
      reject(err);
    });
  });
}

// ─── URL Generation ─────────────────────────────────────────────
function generateAllCandidates(card) {
  const urls = new Set();
  const numFormats = [String(card.num), String(card.num).padStart(2, '0'), String(card.num).padStart(3, '0')];

  const add = (base, num, rarity, name, title, w, ext) => {
    const filename = title ? `${num}_${rarity}_${name}_${title}` : `${num}_${rarity}_${name}`;
    urls.add(`${base}${filename}${w}${ext}`);
  };

  for (const base of BASE_URLS) {
    for (const num of numFormats) {
      for (const rarity of card.rarityPrefixes) {
        for (const name of card.names) {
          // With each title
          for (const title of card.titles) {
            for (const w of WIDTH_SUFFIXES) {
              add(base, num, rarity, name, title, w, '.webp');
            }
            // .jpg/.png only for key widths
            for (const w of ['-1920w', '-960w', '-640w', '']) {
              add(base, num, rarity, name, title, w, '.jpg');
              add(base, num, rarity, name, title, w, '.png');
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

  // Phase 5: wildcard rarity prefixes (name-only, key widths)
  const extraRarities = ['C', 'UC', 'R', 'R_ART', 'M', 'M_Special', 'MV', 'MV_Special',
    'Secret_GOLD', 'SecretV_GOLD', 'S', 'Secret', 'SecretV', 'L', 'Legendary'];
  for (const num of numFormats) {
    for (const rarity of extraRarities) {
      if (card.rarityPrefixes.includes(rarity)) continue; // already covered
      for (const name of card.names.slice(0, 2)) {
        for (const w of ['-1920w', '-960w', '']) {
          add(BASE_URLS[0], num, rarity, name, null, w, '.webp');
        }
      }
    }
  }

  return [...urls].filter(u => !testedSet.has(u));
}

// ─── Worker: process one card ───────────────────────────────────
async function processCard(card, foundCardIds, stats) {
  const allFound = card.cardIds.every(id => foundCardIds.has(id));
  if (allFound) {
    console.log(`  [SKIP] Card ${card.num} (${card.cardIds.join(', ')}) — already found`);
    return;
  }

  const candidates = generateAllCandidates(card);
  if (candidates.length === 0) {
    console.log(`  [SKIP] Card ${card.num} — 0 new URLs`);
    return;
  }

  console.log(`  [START] Card ${card.num} (${card.cardIds.join(', ')}): ${candidates.length} URLs`);

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    if (interrupted) return;
    // Check if found by another worker
    if (card.cardIds.every(id => foundCardIds.has(id))) return;

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
        return; // Found for this card, move on
      }
    }

    if (i > 0 && (i / CONCURRENCY) % 50 === 0) {
      process.stdout.write(`    Card ${card.num}: ${i}/${candidates.length}  (global: ${stats.tested} tested, ${stats.found} found)\r`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`  [DONE] Card ${card.num} — not found (${candidates.length} tested)`);
}

// ─── Main: run all cards in parallel workers ────────────────────
async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  loadProgress();

  const foundCardIds = new Set((progress.found || []).map(f => f.cardId));

  console.log('\n============================================');
  console.log('  BRUTE6-ULTIMATE: Parallel Card Finder');
  console.log(`  ${CONCURRENCY} concurrent requests per worker`);
  console.log(`  ${MISSING_CARDS.length} cards to search`);
  console.log('============================================\n');

  const stats = { tested: testedSet.size, found: progress.found ? progress.found.length : 0 };

  // Run ALL cards in parallel (each card is a worker)
  const workers = MISSING_CARDS.map(card => processCard(card, foundCardIds, stats));
  await Promise.all(workers);

  // Final save
  saveProgress();

  // Report
  const report = [
    '========================================',
    '  BRUTE6-ULTIMATE: Final Report',
    '========================================',
    '',
    `Started: ${progress.startedAt}`,
    `Finished: ${new Date().toISOString()}`,
    `Total URLs tested: ${testedSet.size}`,
    `Total images found: ${stats.found}`,
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
}

process.on('SIGINT', () => {
  console.log('\n\nInterrupted! Saving progress...');
  interrupted = true;
  saveProgress();
  setTimeout(() => process.exit(0), 1000);
});

main().catch(err => {
  console.error('Fatal error:', err);
  saveProgress();
  process.exit(1);
});
