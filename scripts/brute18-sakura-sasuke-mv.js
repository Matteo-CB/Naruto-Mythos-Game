#!/usr/bin/env node
/**
 * brute18-sakura-sasuke-mv.js  —  MEGA MV HUNTER (15K workers)
 *
 * CDN MV pattern analysis from all 8 found MV cards:
 *   104_M_Tsunade           — just first name
 *   108_M_Naruto            — just first name
 *   111_M_Shikamaru         — just first name
 *   113_M_Kiba              — just first name
 *   117_M_Rock_Lee          — two-word first name
 *   120_M_Gaara             — just first name
 *   128_M_Itachi            — just first name
 *   133_M_Naruto_Ramen      — first name + FUN KEYWORD (Ramen not in title!)
 *
 * 135_M_Sakura and 136_M_Sasuke already tested (NOT FOUND).
 * So like 133, they need a suffix keyword. That keyword can be ANYTHING
 * descriptive — not necessarily from the card text.
 *
 * Card data:
 *   KS-135-MV Sakura | title: "He's looking... right at me!" / "Sasuke est en train de me regarder !"
 *     MAIN: Look at top 3 cards, play one, discard rest | UPGRADE: pay 4 less
 *   KS-136-MV Sasuke | title: "You're annoying." / "Tu m'énerves"
 *     MAIN: [continuous] gain 1 chakra on defeat | UPGRADE: defeat friendly+enemy
 *
 * Usage:  node scripts/brute18-sakura-sasuke-mv.js
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const CONCURRENCY   = 15000;
const TIMEOUT_MS    = 6000;
const MIN_FILE_SIZE = 4000;
const OUT_DIR       = path.join(__dirname, '..', 'newvisual');
const REPORT_FILE   = path.join(OUT_DIR, 'brute18_report.txt');
const PROGRESS_FILE = path.join(OUT_DIR, 'brute18_progress.json');
const BASE = 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/';

const agent = new https.Agent({ keepAlive: true, maxSockets: 15000, maxFreeSockets: 2000, timeout: TIMEOUT_MS });
const C = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', red: '\x1b[31m' };

// ═══════════════════════════════════════════════════════════════════════════
// MASSIVE keyword pools — since "Ramen" was NOT in the card text,
// we must try EVERY descriptive word that could relate to the card
// ═══════════════════════════════════════════════════════════════════════════

// Words that could appear as the suffix for Sakura 135-MV
// Title: "He's looking... right at me!" (Sakura's crush on Sasuke)
// Effect: Look at top 3 cards of deck, play one, discard rest
const SAKURA_SUFFIXES = [
  // --- Direct from title words ---
  'Looking', 'Hes_Looking', 'Right_at_Me', 'At_Me', 'Right',
  // --- Thematic: crush/love (like "Ramen" = thematic shortcut) ---
  'Crush', 'Love', 'Heart', 'Blush', 'Fangirl', 'Fan',
  'Gaze', 'Stare', 'Admiration', 'Daydream', 'Dream',
  'Smitten', 'Lovestruck', 'Charmed', 'Shy', 'Blushing',
  'Starry_Eyes', 'Hearts', 'Butterflies', 'Flutter',
  'Affection', 'Devotion', 'Infatuation', 'Longing', 'Yearning',
  'Romance', 'Romantic', 'Passion', 'Desire', 'Adore',
  'Puppy_Love', 'First_Love', 'True_Love',
  // --- Effect themed: fortune/cards/peek ---
  'Insight', 'Vision', 'Foresight', 'Oracle', 'Fortune',
  'Divination', 'Prophecy', 'Clairvoyance', 'Premonition',
  'Scout', 'Scouting', 'Peek', 'Reveal', 'Discover',
  'Search', 'Top_3', 'Deck_Top', 'Draw', 'Pick',
  'Choose', 'Select', 'Play', 'Discard',
  'Strategy', 'Tactics', 'Planning', 'Preparation',
  // --- Character descriptors ---
  'Medical', 'Medic', 'Healing', 'Healer', 'Doctor',
  'Kunoichi', 'Ninja', 'Shinobi', 'Genin', 'Chunin',
  'Cherry_Blossom', 'Cherry', 'Blossom', 'Petal', 'Petals',
  'Flower', 'Spring', 'Pink', 'Rose',
  'Inner', 'Inner_Sakura', 'CHA', 'Shannaroo', 'Shannaro',
  'Punch', 'Strength', 'Power', 'Strong',
  'Recovery', 'Recovery_Team', 'Prowess', 'Chakra',
  'Chakra_Control', 'Chakra_Prowess',
  // --- Team / Group ---
  'Team_7', 'Team7', 'Leaf', 'Konoha', 'Leaf_Village',
  // --- French themed ---
  'Regarder', 'Regard', 'Regarde', 'Sasuke_Regarde',
  'Amour', 'Coeur', 'Fleur', 'Cerisier',
  // --- Naruto universe context ---
  'Haruno', 'Student', 'Apprentice', 'Disciple',
  'Tsunade_Student', 'Fifth', 'Support', 'Protector',
  // --- Single short words (CDN often uses short names) ---
  'Eyes', 'Look', 'See', 'Watch', 'Glance', 'Wink',
  'Smile', 'Cute', 'Pretty', 'Beautiful', 'Beauty',
  'Hope', 'Wish', 'Promise', 'Vow', 'Oath',
  'Fire', 'Will', 'Spirit', 'Soul', 'Mind',
  'Care', 'Kind', 'Gentle', 'Soft', 'Warm',
  'Bell', 'Test', 'Training', 'Trial',
  'Determination', 'Resolve', 'Courage', 'Brave',
];

// Words that could appear as the suffix for Sasuke 136-MV
// Title: "You're annoying." (Sasuke's dismissive attitude)
// Effect: gain 1 chakra on defeat / defeat friendly + enemy
const SASUKE_SUFFIXES = [
  // --- Direct from title words ---
  'Annoying', 'Annoyed', 'Annoy', 'Youre_Annoying',
  // --- Thematic: attitude/dismissive (like "Ramen" = thematic shortcut) ---
  'Cold', 'Loner', 'Lone', 'Lone_Wolf', 'Wolf',
  'Indifferent', 'Dismissive', 'Aloof', 'Silent', 'Quiet',
  'Brooding', 'Dark', 'Shadow', 'Darkness', 'Night',
  'Pride', 'Proud', 'Elite', 'Prodigy', 'Genius',
  'Cool', 'Ice', 'Frozen', 'Frost',
  'Rival', 'Rivalry', 'Competitor', 'Opponent',
  'Solitude', 'Solitary', 'Alone', 'Solo', 'Isolation',
  'Distant', 'Remote', 'Detached', 'Apathy', 'Apathetic',
  'Contempt', 'Scorn', 'Disdain', 'Disinterest',
  'Tsundere', 'Moody', 'Grumpy', 'Irritated',
  // --- Effect themed: defeat/chakra/drain ---
  'Defeat', 'Destroy', 'Eliminate', 'Vanquish',
  'Sacrifice', 'Mutual_Defeat', 'Exchange', 'Trade',
  'Chakra', 'Chakra_Drain', 'Drain', 'Absorb', 'Harvest',
  'Power', 'Fury', 'Rage', 'Wrath', 'Vengeance',
  'Battle', 'Combat', 'Fight', 'Fighter', 'Warrior',
  'Ruthless', 'Merciless', 'Relentless', 'Unstoppable',
  'Deadly', 'Lethal', 'Fatal', 'Kill', 'Killer',
  // --- Jutsu / abilities ---
  'Sharingan', 'Chidori', 'Lightning', 'Lightning_Blade',
  'Fire', 'Fireball', 'Fire_Ball', 'Katon', 'Grand_Fireball',
  'Curse', 'Curse_Mark', 'Cursed_Seal', 'Cursed',
  'Heaven', 'Heaven_Curse', 'Heaven_Mark', 'Seal', 'Mark',
  'Lion', 'Lions', 'Lions_Barrage', 'Lion_Combo', 'Barrage',
  'Blade', 'Sword', 'Katana', 'Kusanagi',
  'Snake', 'Serpent', 'Hawk', 'Eagle',
  // --- Character descriptors ---
  'Avenger', 'Revenge', 'Vengeance', 'Last',
  'Last_Uchiha', 'Survivor', 'Lone_Survivor', 'Heir',
  'Ninja', 'Shinobi', 'Genin', 'Rogue', 'Rogue_Ninja',
  'Prodigy', 'Genius', 'Talent', 'Gifted', 'Chosen',
  // --- Team / Group ---
  'Team_7', 'Team7', 'Leaf', 'Konoha', 'Leaf_Village',
  'Jutsu',
  // --- French themed ---
  'Enerves', 'Enerve', 'Menerves', 'Tu_Menerves',
  'Agace', 'Agacant', 'Froid', 'Solitaire', 'Orgueil',
  // --- Naruto universe context ---
  'Uchiha', 'Uchiwa', 'Clan', 'Brother', 'Itachi',
  'Hatred', 'Hate', 'Anger', 'Pain', 'Suffering',
  'Bond', 'Bonds', 'Break', 'Broken',
  'Orochimaru', 'Power_Seeker', 'Ambition',
  // --- Single short words ---
  'Eyes', 'Red_Eyes', 'Red', 'Black', 'Blue',
  'Storm', 'Thunder', 'Flash', 'Strike', 'Bolt',
  'Edge', 'Sharp', 'Cut', 'Slice', 'Pierce',
  'Flames', 'Blaze', 'Burn', 'Inferno',
  'Resolve', 'Will', 'Determination', 'Focus',
  'Speed', 'Fast', 'Quick', 'Swift', 'Rapid',
  'Bell', 'Test', 'Training', 'Trial',
];

// Name variants
const SAKURA_NAMES = ['Sakura', 'Sakura_Haruno', 'SakuraHaruno', 'Haruno_Sakura', 'Sakura-Haruno', 'SAKURA', 'SAKURA_HARUNO'];
const SASUKE_NAMES = ['Sasuke', 'Sasuke_Uchiha', 'Sasuke_Uchiwa', 'SasukeUchiha', 'SasukeUchiwa', 'Uchiha_Sasuke', 'Uchiwa_Sasuke', 'Sasuke-Uchiha', 'Sasuke-Uchiwa', 'SASUKE', 'SASUKE_UCHIHA', 'SASUKE_UCHIWA'];

// Tag variants (M is proven, rest are plausible)
const ALL_TAGS = ['M', 'MV', 'V', 'M_Special', 'Mythos', 'MythosV', 'SecretV_GOLD', 'Secret_GOLD', 'GOLD', 'Special', 'Promo', 'EX', 'SP'];
const TOP_TAGS = ['M', 'MV', 'V'];  // for 2-word combos to limit explosion

// ═══════════════════════════════════════════════════════════════════════════
// URL GENERATION
// ═══════════════════════════════════════════════════════════════════════════
function generateUrls() {
  const urlSet = new Set();
  const items = [];
  function add(f, card) { const u = BASE + f; if (!urlSet.has(u)) { urlSet.add(u); items.push({ url: u, card }); } }

  function gen(label, num, names, suffixes) {
    // ═══ 1. Just name, no suffix (all tags, all names) ═══
    for (const name of names) {
      for (const tag of ALL_TAGS) {
        add(`${num}_${tag}_${name}-1920w.webp`, label);
        add(`${num}_${tag}_${name}_-1920w.webp`, label);
      }
      add(`${num}_${name}-1920w.webp`, label);
    }

    // ═══ 2. Name + 1 suffix (all tags, all names, all suffixes) ═══
    for (const name of names) {
      for (const tag of ALL_TAGS) {
        for (const s of suffixes) {
          add(`${num}_${tag}_${name}_${s}-1920w.webp`, label);
        }
      }
      // No tag
      for (const s of suffixes) {
        add(`${num}_${name}_${s}-1920w.webp`, label);
      }
    }

    // ═══ 3. Name + 2-suffix combos (top tags, top 4 names) ═══
    const topNames = names.slice(0, 4);
    for (const name of topNames) {
      for (const tag of TOP_TAGS) {
        for (const s1 of suffixes) {
          for (const s2 of suffixes) {
            if (s1 === s2) continue;
            add(`${num}_${tag}_${name}_${s1}_${s2}-1920w.webp`, label);
          }
        }
      }
    }

    // ═══ 4. Name + 2-suffix with hyphens (tag M only, top 2 names) ═══
    for (const name of topNames.slice(0, 2)) {
      for (const s1 of suffixes) {
        for (const s2 of suffixes) {
          if (s1 === s2) continue;
          add(`${num}_M_${name}_${s1}-${s2}-1920w.webp`, label);
        }
      }
    }

    // ═══ 5. No number prefix (tag + name + suffix) ═══
    for (const name of topNames.slice(0, 3)) {
      for (const tag of TOP_TAGS) {
        add(`${tag}_${name}-1920w.webp`, label);
        for (const s of suffixes) {
          add(`${tag}_${name}_${s}-1920w.webp`, label);
        }
      }
    }

    // ═══ 6. Nearby numbers (133, 134, 137, 138, 139, 140) ═══
    const altNums = [num - 3, num - 2, num - 1, num + 1, num + 2, num + 3, num + 4, num + 5];
    for (const n of altNums) {
      if (n < 1 || n > 200 || n === num) continue;
      for (const name of topNames.slice(0, 2)) {
        add(`${n}_M_${name}-1920w.webp`, label);
        for (const s of suffixes) {
          add(`${n}_M_${name}_${s}-1920w.webp`, label);
        }
      }
    }

    // ═══ 7. Suffix alone with number (no name, just 135_M_Crush) ═══
    for (const s of suffixes) {
      add(`${num}_M_${s}-1920w.webp`, label);
    }
  }

  process.stdout.write(`  ${C.dim}Generating Sakura 135 combos...${C.reset}`);
  gen('Sakura MV (KS-135-MV)', 135, SAKURA_NAMES, SAKURA_SUFFIXES);
  const mid = urlSet.size;
  process.stdout.write(` ${mid.toLocaleString()}\n`);

  process.stdout.write(`  ${C.dim}Generating Sasuke 136 combos...${C.reset}`);
  gen('Sasuke MV (KS-136-MV)', 136, SASUKE_NAMES, SASUKE_SUFFIXES);
  process.stdout.write(` +${(urlSet.size - mid).toLocaleString()} = ${C.bold}${urlSet.size.toLocaleString()}${C.reset}\n`);

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

  console.log(`\n${C.bold}${C.cyan}  BRUTE18 - SAKURA & SASUKE MV MEGA HUNTER${C.reset}`);
  console.log(`${C.dim}  15K workers | based on all 8 found MV CDN patterns${C.reset}\n`);
  console.log(`  ${C.yellow}135${C.reset} Sakura "He's looking... right at me!"  (${SAKURA_SUFFIXES.length} suffixes x ${SAKURA_NAMES.length} names)`);
  console.log(`  ${C.yellow}136${C.reset} Sasuke "You're annoying."              (${SASUKE_SUFFIXES.length} suffixes x ${SASUKE_NAMES.length} names)\n`);

  const allUrls = generateUrls();
  const total = allUrls.length;
  console.log(`\n  Total: ${C.bold}${total.toLocaleString()}${C.reset} URLs | Workers: ${C.bold}${CONCURRENCY.toLocaleString()}${C.reset}\n`);

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

  const pi = setInterval(showProgress, 400);

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
          process.stdout.write(`\n\n  ${C.bold}${C.green}!!! FOUND !!!${C.reset} [${item.card}]\n  ${C.green}${filename} (${(size/1024).toFixed(1)} KB)${C.reset}\n  ${C.dim}${item.url}${C.reset}\n\n`);
          const dest = path.join(OUT_DIR, filename);
          try { await downloadFile(item.url, dest); process.stdout.write(`  ${C.dim}-> Saved to ${dest}${C.reset}\n`); } catch (e) { process.stdout.write(`  ${C.yellow}-> DL failed: ${e.message}${C.reset}\n`); }
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
    'BRUTE18 - SAKURA & SASUKE MV MEGA HUNTER',
    `Date: ${new Date().toISOString()}`,
    '='.repeat(70), '',
    `URLs: ${total.toLocaleString()} | Time: ${elapsed}s | Workers: ${numW} | Errors: ${errors}`, '',
    'MV pattern analysis (all 8 found):',
    '  104_M_Tsunade              (just name)',
    '  108_M_Naruto               (just name)',
    '  111_M_Shikamaru            (just name)',
    '  113_M_Kiba                 (just name)',
    '  117_M_Rock_Lee             (two-word name)',
    '  120_M_Gaara                (just name)',
    '  128_M_Itachi               (just name)',
    '  133_M_Naruto_Ramen         (name + creative keyword)',
    '  135_M_Sakura               TESTED, NOT FOUND',
    '  136_M_Sasuke               TESTED, NOT FOUND',
    '',
    `Sakura suffixes tried: ${SAKURA_SUFFIXES.length}`,
    `Sasuke suffixes tried: ${SASUKE_SUFFIXES.length}`,
    `Found: ${found.length}`, '',
  ];
  if (found.length > 0) {
    report.push('FOUND:');
    for (const f of found) { report.push(`  [${f.card}] ${f.filename} (${(f.size/1024).toFixed(1)} KB)`); report.push(`    ${f.url}`); }
  } else {
    report.push('No images found. These MV cards are likely not yet uploaded to the CDN.');
  }
  report.push('', '='.repeat(70));
  fs.writeFileSync(REPORT_FILE, report.join('\n'), 'utf8');
  try { fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ tested, total, found: found.length, errors, elapsed, foundUrls: found.map(f => f.url), completed: true }, null, 2)); } catch {}

  console.log(`${C.bold}  RESULTS${C.reset}`);
  console.log(`  Tested: ${total.toLocaleString()} in ${elapsed}s`);
  console.log(`  Found:  ${C.bold}${found.length > 0 ? C.green : C.red}${found.length}${C.reset}`);
  console.log(`  Report: ${REPORT_FILE}\n`);
  if (found.length > 0) for (const f of found) console.log(`    ${C.green}${f.filename}${C.reset}`);
  else console.log(`  ${C.yellow}Cards probably not on CDN yet.${C.reset}\n`);

  agent.destroy();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
