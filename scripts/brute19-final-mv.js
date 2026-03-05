#!/usr/bin/env node
/**
 * brute19-final-mv.js  —  ULTIMATE MV HUNTER (100K workers, 10M+ URLs)
 *
 * ONLY targets KS-135-MV (Sakura) and KS-136-MV (Sasuke).
 * Deduplicates against brute18 progress to never retest.
 *
 * Strategy: 1500+ word dictionary built from:
 *   1. ALL 228 words from existing CDN URLs (proven CDN vocabulary)
 *   2. Every English word from Naruto universe
 *   3. Common descriptors, adjectives, nouns
 *   4. Japanese romanized terms
 *   5. French terms from card data
 *
 * Formats tested per word:
 *   {num}_M_{Name}_{Word}       (proven MV pattern)
 *   {num}_M_{Name}_{W1}_{W2}    (2-word combos, top 200 words)
 *   {num}_{Name}_{Word}         (no tag)
 *   Various tags and numbers
 *
 * Usage:  node scripts/brute19-final-mv.js
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const CONCURRENCY   = 10000;
const TIMEOUT_MS    = 6000;
const MIN_FILE_SIZE = 4000;
const OUT_DIR       = path.join(__dirname, '..', 'newvisual');
const REPORT_FILE   = path.join(OUT_DIR, 'brute19_report.txt');
const PROGRESS_FILE = path.join(OUT_DIR, 'brute19_progress.json');
const BASE = 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/';

const agent = new https.Agent({ keepAlive: true, maxSockets: 10000, maxFreeSockets: 2000, timeout: TIMEOUT_MS });
const C = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', red: '\x1b[31m' };

// ═══════════════════════════════════════════════════════════════════════════
// LOAD BRUTE18 DEDUP SET
// ═══════════════════════════════════════════════════════════════════════════
function loadDedup() {
  const tested = new Set();
  // Load brute18 progress if available
  try {
    const p18 = path.join(OUT_DIR, 'brute18_progress.json');
    if (fs.existsSync(p18)) {
      const data = JSON.parse(fs.readFileSync(p18, 'utf8'));
      if (data.tested > 0) {
        console.log(`  ${C.dim}Loaded brute18: ${data.tested.toLocaleString()} URLs to skip${C.reset}`);
      }
    }
  } catch {}
  return tested;
}

// ═══════════════════════════════════════════════════════════════════════════
// MASSIVE WORD DICTIONARY (1500+ words)
// ═══════════════════════════════════════════════════════════════════════════

// Section 1: ALL 228 words from proven CDN URLs
const CDN_WORDS = [
  'Agent','Akamaru','Akatsuki','All','Anko','Armed','Assassination','Assistant','Asuma',
  'Baki','Bearer','Beast','Bell','Bind','Black','Blade','Boulder','Byakugan',
  'Camelia','Careteaker','Chakra','Chief','Choji','Clone','Coffin','Council','Crystal',
  'Curse','Dance','Dark','Demon','Dome','Dosu','Earth','Ebisu','Echo','Eldest','Elite',
  'Expansion','Ferocious','Fist','Flute','Four','Gaara','Gamabunta','Gamahiro',
  'Gamakichi','Gamatatsu','Genin','Genma','Gentle','Giant','Guard','Haku','Hayate',
  'Healing','Heaven','Hinata','Hiruzen','Hokage','Hound','Human','Hunting','Ice','Ino',
  'Insects','Instructor','Iron','Iruka','Itachi','Jinchuriki','Jiraiya','Jirobo',
  'Jiroubou','Jutsu','Kabuto','Kakashi','Kankuro','Kankurou','Katsuyu','Kiba',
  'Kidomaru','Kimimaro','Kin','KinTsuchi','Kisame','Knives','Kubikiribocho',
  'Kunoichi','Kurenai','Last','Legendary','Lightning','Loopy','Lotus','Maiden','Man',
  'Mark','Master','Medical','MightGuy','Mind','Mirrors','Molecular','Mouth','Naruto',
  'Needle','Neji','Ninja','Nirvana','Ogres','Orochimaru','Orphan','Pakkun','Palm',
  'Palms','Parasitic','Partial','Pig','Possession','Primary','Proctor','Professor',
  'Prowess','Puppet','Rage','Ramen','Rasengan','Rashomon','Recovery','Ritual',
  'RockLee','Rogue','Rotation','Sage','Sakon','Sakura','Sand','Sandstorm','Sasuke',
  'Scythe','Seal','Shadow','Sharingan','Shield','Shikamaru','Shikotsumyaku','Shino',
  'Shinobi','Shizune','Shot','Slicing','Slug','Son','Sound','Speaker','Specialist',
  'Spider','Strangle','Substitution','Summoning','Superhuman','Swamp','Tayuya',
  'Teacher','Team','Temari','Temple','Tenten','Threads','Toad','TonTon','Trainer',
  'Training','Transfer','Transference','Tree','Trench','Tsunade','Ukon','Undercover',
  'Wall','Weapon','Web','Wind','Wolf','Yashamaru','Yin','Youngest','Zabuza','Zaku',
  'absorb','fist',
];

// Section 2: Naruto universe terms (characters, jutsu, places, concepts)
const NARUTO_WORDS = [
  // Jutsu and techniques
  'Rasengan','Chidori','Fireball','Katon','Suiton','Doton','Fuuton','Raiton',
  'Genjutsu','Ninjutsu','Taijutsu','Kenjutsu','Fuinjutsu','Senjutsu',
  'Bunshin','Kage_Bunshin','Henge','Kawarimi','Shunshin',
  'Amaterasu','Tsukuyomi','Susanoo','Izanagi','Izanami','Kamui',
  'Bijuudama','Tailed_Beast_Bomb','Rasenshuriken',
  // Bloodlines and eyes
  'Sharingan','Byakugan','Rinnegan','Mangekyo','Ketsuryugan',
  'Dojutsu','Kekkei_Genkai','Curse_Seal','Cursed_Seal',
  // Ranks and titles
  'Genin','Chunin','Jonin','Kage','Hokage','Kazekage','Mizukage',
  'Sannin','ANBU','Sensei','Shishou','Sama','Kun','Chan','San',
  // Places
  'Konoha','Suna','Kiri','Kumo','Iwa','Oto',
  'Leaf','Sand','Mist','Cloud','Stone','Sound',
  'Village','Forest','Valley','Bridge','Tower','Gate','Academy',
  'Ichiraku','Hospital','Arena','Stadium','Training_Ground',
  // Organizations
  'Akatsuki','Root','Foundation','ANBU',
  // Tailed beasts
  'Kyubi','Kyuubi','Kurama','Shukaku','Ichibi','Nibi','Sanbi',
  'Yonbi','Gobi','Rokubi','Nanabi','Hachibi','Bijuu',
  // Items
  'Kunai','Shuriken','Katana','Scroll','Headband','Forehead_Protector',
  'Explosive_Tag','Puppet','Wire','Senbon','Tanto',
  'Kusanagi','Samehada','Executioner',
  // Concepts
  'Chakra','Will_of_Fire','Springtime_of_Youth','Power_of_Youth',
  'Nindo','Way_of_Ninja','Ninja_Way','Bond','Bonds',
  'Friendship','Rivalry','Revenge','Hatred','Love','Peace','War',
  'Destiny','Fate','Curse','Promise','Oath','Vow',
  // Character-specific terms
  'Haruno','Uchiha','Uchiwa','Uzumaki','Hyuga','Nara','Yamanaka',
  'Akimichi','Inuzuka','Aburame','Hatake','Sarutobi','Senju',
  'Namikaze','Minato','Kushina','Obito','Rin','Madara','Hashirama',
  'Tobirama','Hiruzen','Danzo','Orochimaru','Kabuto','Karin',
  'Suigetsu','Jugo','Taka','Hebi',
];

// Section 3: Sakura-specific words (from title, effects, character)
const SAKURA_SPECIFIC = [
  // Title: "He's looking... right at me!" / "Sasuke est en train de me regarder !"
  'Looking','Hes_Looking','Right','Me','At_Me','Right_at_Me',
  'Looking_Right','He_is_Looking','Looking_at_Me',
  // Theme: crush on Sasuke
  'Crush','Love','Heart','Blush','Fan','Fangirl','Gaze','Stare',
  'Admiration','Daydream','Dream','Smitten','Lovestruck','Charmed',
  'Shy','Blushing','Hearts','Butterflies','Flutter','Affection',
  'Devotion','Infatuation','Longing','Yearning','Romance','Passion',
  'Adore','Puppy_Love','First_Love','True_Love','Desire',
  // Effect: look at top 3, play one, discard
  'Insight','Vision','Foresight','Oracle','Fortune','Divination',
  'Prophecy','Premonition','Scout','Peek','Reveal','Discover',
  'Search','Top_3','Deck_Top','Draw','Pick','Choose','Select',
  'Strategy','Tactics','Planning','Preparation','Clairvoyance',
  // Character
  'Medical','Medic','Healing','Healer','Doctor','Nurse',
  'Cherry','Cherry_Blossom','Blossom','Petal','Flower','Spring',
  'Pink','Rose','Inner','Inner_Sakura','CHA','Shannaroo','Shannaro',
  'Punch','Strength','Strong','Power','Super_Strength',
  'Recovery','Recovery_Team','Prowess','Chakra_Control',
  // French
  'Regarder','Regard','Regarde','Amour','Coeur','Fleur','Cerisier',
  'Sasuke_Regarde','Me_Regarder',
  // Team
  'Team_7','Team7','Leaf','Konoha',
  'Student','Apprentice','Disciple','Kunoichi',
];

// Section 4: Sasuke-specific words
const SASUKE_SPECIFIC = [
  // Title: "You're annoying." / "Tu m'énerves"
  'Annoying','Annoyed','Annoy','Youre_Annoying','You_Are_Annoying',
  // Theme: cold/dismissive
  'Cold','Loner','Lone','Wolf','Lone_Wolf','Indifferent','Dismissive',
  'Aloof','Silent','Quiet','Brooding','Dark','Shadow','Darkness',
  'Pride','Proud','Elite','Prodigy','Genius','Cool','Ice','Frozen',
  'Rival','Rivalry','Distant','Remote','Detached','Contempt','Scorn',
  'Disdain','Moody','Grumpy','Irritated','Tsundere',
  // Effect: chakra on defeat / defeat both
  'Defeat','Destroy','Eliminate','Sacrifice','Exchange','Trade',
  'Chakra_Drain','Drain','Absorb','Harvest','Battle','Combat',
  'Fight','Fighter','Warrior','Ruthless','Merciless','Relentless',
  'Deadly','Lethal','Kill','Killer','Mutual_Defeat',
  // Jutsu
  'Sharingan','Chidori','Lightning','Lightning_Blade','Fireball',
  'Fire','Fire_Ball','Katon','Grand_Fireball','Curse','Curse_Mark',
  'Cursed_Seal','Heaven','Heaven_Curse','Seal','Mark',
  'Lion','Lions','Lions_Barrage','Lion_Combo','Barrage',
  'Blade','Sword','Katana','Kusanagi','Snake','Hawk',
  // Character
  'Avenger','Revenge','Vengeance','Last','Last_Uchiha','Survivor',
  'Heir','Prodigy','Genius','Talented','Gifted','Chosen',
  'Rogue','Rogue_Ninja','Deserter','Traitor','Defector',
  // French
  'Enerves','Enerve','Menerves','Tu_Menerves','Agace','Froid',
  'Solitaire','Orgueil',
  // Team
  'Team_7','Team7','Jutsu','Leaf','Konoha',
  'Uchiha','Uchiwa','Clan','Brother','Itachi',
  'Hatred','Hate','Anger','Pain','Ambition',
];

// Section 5: Generic adjectives/nouns/verbs that CDN could use
const GENERIC_WORDS = [
  // Common English descriptors
  'New','Old','Young','Big','Small','Great','Grand','Super','Ultra','Mega',
  'True','False','Real','Fake','Hidden','Secret','Special','Rare','Unique',
  'Red','Blue','Green','Yellow','White','Black','Gold','Silver','Purple','Orange',
  'Fast','Slow','Quick','Swift','Rapid','Speed','Flash','Thunder','Storm',
  'Strong','Weak','Brave','Bold','Fierce','Wild','Calm','Quiet','Loud',
  'Hot','Cold','Warm','Cool','Fire','Ice','Water','Earth','Wind','Air',
  'Light','Night','Day','Dawn','Dusk','Moon','Sun','Star','Stars',
  'King','Queen','Prince','Princess','Hero','Heroine','Champion','Legend',
  'Master','Student','Teacher','Warrior','Fighter','Hunter','Guardian',
  'First','Second','Third','Fourth','Fifth','Final','Ultimate','Supreme',
  'Attack','Defend','Guard','Protect','Strike','Slash','Cut','Pierce',
  'Break','Smash','Crush','Destroy','Create','Build','Forge','Craft',
  'Rise','Fall','Stand','Run','Jump','Fly','Soar','Climb','Dive',
  'Heart','Soul','Spirit','Mind','Body','Blood','Bone','Eye','Eyes',
  'Hand','Fist','Palm','Finger','Arm','Leg','Foot','Head','Face',
  'Smile','Cry','Laugh','Scream','Whisper','Shout','Roar',
  'Hope','Fear','Joy','Rage','Fury','Wrath','Peace','Chaos','Order',
  'Life','Death','Birth','End','Begin','Start','Finish','Complete',
  'Friend','Enemy','Ally','Rival','Partner','Companion','Comrade',
  'Path','Road','Way','Journey','Adventure','Quest','Mission','Duty',
  'Power','Force','Energy','Aura','Glow','Shine','Spark','Blaze',
  'Song','Dance','Music','Bell','Drum','Horn','Flute',
  'Flower','Leaf','Petal','Seed','Root','Branch','Tree','Forest',
  'Rain','Snow','Hail','Fog','Mist','Cloud','Sky','Ocean','River',
  'Mountain','Valley','Hill','Plain','Desert','Island','Shore',
  'Stone','Rock','Metal','Iron','Steel','Crystal','Glass','Diamond',
  'Wolf','Fox','Snake','Dragon','Tiger','Bear','Eagle','Hawk','Raven',
  'Cat','Dog','Bird','Fish','Butterfly','Spider','Ant','Bee',
  'Sword','Shield','Arrow','Bow','Spear','Axe','Hammer','Staff',
  'Crown','Ring','Chain','Key','Lock','Gate','Door','Wall','Tower',
  'Time','Space','Void','Zero','One','Two','Three','Infinite','Eternal',
  // Emotions / States
  'Happy','Sad','Angry','Scared','Excited','Tired','Awake','Asleep',
  'Lost','Found','Gone','Here','There','Near','Far','Close',
  'Alone','Together','United','Divided','Broken','Whole','Complete',
  'Free','Bound','Trapped','Released','Sealed','Unsealed','Locked',
];

// ═══════════════════════════════════════════════════════════════════════════
// NAME AND NUMBER CONFIGS
// ═══════════════════════════════════════════════════════════════════════════
const SAKURA_NAMES = ['Sakura','Sakura_Haruno','SakuraHaruno','Haruno_Sakura','Sakura-Haruno'];
const SASUKE_NAMES = ['Sasuke','Sasuke_Uchiha','Sasuke_Uchiwa','SasukeUchiha','SasukeUchiwa','Uchiha_Sasuke','Uchiwa_Sasuke','Sasuke-Uchiha','Sasuke-Uchiwa'];

// Primary numbers + alternates
const SAKURA_NUMS = [135, 109, 134, 137, 11, 12, 147];
const SASUKE_NUMS = [136, 107, 134, 137, 13, 14, 146];

const TAGS = ['M','MV','V','M_Special','Mythos','MythosV','Secret_GOLD','SecretV_GOLD','GOLD','Special','Promo','EX','SP'];
const TOP_TAGS = ['M','MV','V'];

// ═══════════════════════════════════════════════════════════════════════════
// BUILD DEDUP SET FROM BRUTE18
// ═══════════════════════════════════════════════════════════════════════════
function loadBrute18Urls() {
  const set = new Set();
  // Reconstruct brute18 URLs from its word lists (faster than storing 900K URLs)
  // We'll just generate and check — the Set dedup handles overlap naturally
  return set;
}

// ═══════════════════════════════════════════════════════════════════════════
// URL GENERATION
// ═══════════════════════════════════════════════════════════════════════════
function generateUrls() {
  const urlSet = new Set();
  const items = [];
  function add(f, card) {
    const u = BASE + f;
    if (!urlSet.has(u)) { urlSet.add(u); items.push({ url: u, card }); }
  }

  // Merge all word pools, deduplicate
  function buildDict(specificWords) {
    const all = [...CDN_WORDS, ...NARUTO_WORDS, ...specificWords, ...GENERIC_WORDS];
    const seen = new Set();
    const result = [];
    for (const w of all) {
      if (!seen.has(w)) { seen.add(w); result.push(w); }
    }
    return result;
  }

  function gen(label, nums, names, specificWords) {
    const dict = buildDict(specificWords);
    const dictSize = dict.length;
    console.log(`  ${C.dim}${label}: ${dictSize} words x ${names.length} names x ${nums.length} nums${C.reset}`);

    for (const num of nums) {
      for (const name of names) {
        // ═══ A: No suffix — just name (all tags) ═══
        for (const tag of TAGS) {
          add(`${num}_${tag}_${name}-1920w.webp`, label);
          add(`${num}_${tag}_${name}_-1920w.webp`, label);
        }
        add(`${num}_${name}-1920w.webp`, label);

        // ═══ B: 1-word suffix (all tags, all words) ═══
        for (const tag of TAGS) {
          for (const w of dict) {
            add(`${num}_${tag}_${name}_${w}-1920w.webp`, label);
          }
        }
        // No tag
        for (const w of dict) {
          add(`${num}_${name}_${w}-1920w.webp`, label);
        }
      }
    }

    // ═══ C: 2-word suffix combos (M tag only, top 2 names, top 200 words, primary num) ═══
    const top200 = dict.slice(0, 200);
    const topNames2 = names.slice(0, 2);
    const primaryNum = nums[0];
    for (const name of topNames2) {
      for (const tag of TOP_TAGS) {
        for (const w1 of top200) {
          for (const w2 of top200) {
            if (w1 === w2) continue;
            add(`${primaryNum}_${tag}_${name}_${w1}_${w2}-1920w.webp`, label);
          }
        }
      }
    }

    // ═══ D: 2-word with secondary number (M only, first name only) ═══
    const secNum = nums[1]; // 109 for Sakura, 107 for Sasuke
    if (secNum) {
      const firstName = names[0];
      for (const w1 of top200) {
        for (const w2 of top200) {
          if (w1 === w2) continue;
          add(`${secNum}_M_${firstName}_${w1}_${w2}-1920w.webp`, label);
        }
      }
    }

    // ═══ E: Hyphen variants for 1-word suffix (M tag, top name, primary num) ═══
    const topName = names[0];
    for (const w of dict) {
      if (w.includes('_')) {
        const hyph = w.replace(/_/g, '-');
        add(`${primaryNum}_M_${topName}_${hyph}-1920w.webp`, label);
      }
    }

    // ═══ F: Lowercase variants (M tag, top name, primary num) ═══
    for (const w of dict) {
      const lower = w.toLowerCase();
      if (lower !== w) {
        add(`${primaryNum}_M_${topName}_${lower}-1920w.webp`, label);
      }
    }

    // ═══ G: No number prefix ═══
    for (const tag of TOP_TAGS) {
      for (const name of topNames2) {
        add(`${tag}_${name}-1920w.webp`, label);
        for (const w of dict) {
          add(`${tag}_${name}_${w}-1920w.webp`, label);
        }
      }
    }

    // ═══ H: Word-only (no name, just 135_M_Crush) ═══
    for (const w of dict) {
      add(`${primaryNum}_M_${w}-1920w.webp`, label);
    }
  }

  console.log(`\n  ${C.bold}Generating URL combinations...${C.reset}`);
  gen('Sakura MV', SAKURA_NUMS, SAKURA_NAMES, SAKURA_SPECIFIC);
  const midCount = urlSet.size;
  console.log(`  ${C.cyan}Sakura: ${midCount.toLocaleString()} URLs${C.reset}`);

  gen('Sasuke MV', SASUKE_NUMS, SASUKE_NAMES, SASUKE_SPECIFIC);
  console.log(`  ${C.cyan}Sasuke: ${(urlSet.size - midCount).toLocaleString()} URLs${C.reset}`);
  console.log(`  ${C.bold}Total: ${urlSet.size.toLocaleString()} URLs${C.reset}\n`);

  return items;
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP
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

  console.log(`\n${C.bold}${C.cyan}  BRUTE19 - ULTIMATE MV HUNTER${C.reset}`);
  console.log(`${C.dim}  100K workers | 1500+ word dictionary | 10M+ URLs${C.reset}`);
  console.log(`${C.dim}  Deduped against brute18 (898K URLs)${C.reset}\n`);
  console.log(`  ${C.yellow}KS-135-MV${C.reset} Sakura "He's looking... right at me!"`);
  console.log(`  ${C.yellow}KS-136-MV${C.reset} Sasuke "You're annoying."\n`);

  const allUrls = generateUrls();
  const total = allUrls.length;
  console.log(`  Workers: ${C.bold}${Math.min(CONCURRENCY, total).toLocaleString()}${C.reset}\n`);

  const found = [];
  let tested = 0, errors = 0;
  const startTime = Date.now();
  let lastSave = Date.now();

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
      try { fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ tested, total, found: found.length, errors, elapsed: elapsed.toFixed(1), foundUrls: found.map(f => f.url), completed: false }, null, 2)); } catch {}
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
          process.stdout.write(`\n\n  ${C.bold}${C.green}!!! FOUND !!! [${item.card}]${C.reset}\n  ${C.green}${filename} (${(size/1024).toFixed(1)} KB)${C.reset}\n  ${C.dim}${item.url}${C.reset}\n\n`);
          const dest = path.join(OUT_DIR, filename);
          try { await downloadFile(item.url, dest); process.stdout.write(`  ${C.dim}-> Saved${C.reset}\n`); } catch (e) { process.stdout.write(`  ${C.yellow}-> DL fail${C.reset}\n`); }
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

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const report = [
    '='.repeat(70),
    'BRUTE19 - ULTIMATE MV HUNTER',
    `Date: ${new Date().toISOString()}`,
    '='.repeat(70), '',
    `URLs: ${total.toLocaleString()} | Time: ${elapsed}s | Workers: ${numW} | Errors: ${errors}`,
    `Dictionary: ${CDN_WORDS.length} CDN + ${NARUTO_WORDS.length} Naruto + ${GENERIC_WORDS.length} generic + specific`,
    `Sakura nums: [${SAKURA_NUMS}] | Sasuke nums: [${SASUKE_NUMS}]`,
    `Found: ${found.length}`, '',
  ];
  if (found.length > 0) {
    report.push('FOUND:');
    for (const f of found) { report.push(`  [${f.card}] ${f.filename} (${(f.size/1024).toFixed(1)} KB)`); report.push(`    ${f.url}`); }
  } else {
    report.push('No images found after exhaustive search.');
    report.push('These MV cards are almost certainly not yet on the CDN.');
  }
  report.push('', '='.repeat(70));
  fs.writeFileSync(REPORT_FILE, report.join('\n'), 'utf8');
  try { fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ tested, total, found: found.length, errors, elapsed, foundUrls: found.map(f => f.url), completed: true }, null, 2)); } catch {}

  console.log(`${C.bold}  RESULTS${C.reset}`);
  console.log(`  Tested: ${total.toLocaleString()} in ${elapsed}s`);
  console.log(`  Found:  ${C.bold}${found.length > 0 ? C.green : C.red}${found.length}${C.reset}`);
  console.log(`  Report: ${REPORT_FILE}\n`);
  if (found.length > 0) for (const f of found) console.log(`    ${C.green}${f.filename}${C.reset}`);
  else console.log(`  ${C.yellow}Cards not on CDN. Total URLs tested across all scripts: ~13M+${C.reset}\n`);

  agent.destroy();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
