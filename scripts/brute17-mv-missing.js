#!/usr/bin/env node
/**
 * brute17-mv-missing.js  —  MISSING MV CARD HUNTER
 *
 * Focused on finding the 4 MV cards still missing from CDN:
 *
 *   KS-111-MV  Shikamaru  (has image locally, CDN URL unknown)
 *   KS-117-MV  Rock Lee   (has image locally, CDN URL unknown)
 *   KS-135-MV  Sakura     (no image at all)
 *   KS-136-MV  Sasuke     (no image at all)
 *
 * Proven MV CDN pattern:  {number}_M_{Name}-1920w.webp
 * Found so far:
 *   104_M_Tsunade, 108_M_Naruto, 113_M_Kiba,
 *   120_M_Gaara, 128_M_Itachi, 133_M_Naruto_Ramen
 *
 * MV numbers use the R card number (not MV internal number):
 *   Shikamaru MV = 111 (KS-111-R = Shikamaru)
 *   Rock Lee MV  = 117 (KS-117-R = Rock Lee)
 *   Sakura MV    = 109 (KS-109-R = Sakura) or 135 (internal MV number)
 *   Sasuke MV    = 110 (KS-110-R = Sasuke) or 136 (internal MV number)
 *
 * This script tries MANY name/title/number combos for these 4 cards,
 * plus also explores the M_Special pattern (used by 143/144 Mythos).
 *
 * Usage:  node scripts/brute17-mv-missing.js
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// --- CONFIG ---
const CONCURRENCY   = 200;
const TIMEOUT_MS    = 4000;
const MIN_FILE_SIZE = 4000;
const OUT_DIR       = path.join(__dirname, '..', 'newvisual');
const REPORT_FILE   = path.join(OUT_DIR, 'brute17_mv_report.txt');

const BASE = 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/';

const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 400,
  maxFreeSockets: 100,
  timeout: TIMEOUT_MS,
});

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
};

// --- TARGET CARDS ---
// Each card: possible CDN numbers + name variants + title variants
const TARGET_CARDS = [
  {
    id: 'KS-111-MV',
    char: 'Shikamaru',
    // Could use 111 (R number), 150 (old MV number), 21/22 (C/UC numbers)
    numbers: [111, 150, 21, 22],
    names: [
      'Shikamaru', 'Shikamaru_Nara', 'ShikamaruNara', 'Nara_Shikamaru',
    ],
    titles: [
      'Shadow_Strangle', 'Shadow_Strangle_Jutsu', 'Shadow_Possession',
      'Shadow', 'Strangle', 'Genin', 'Strategist', 'Nara',
      'Shadow_Bind', 'Shadow_Sewing',
    ],
  },
  {
    id: 'KS-117-MV',
    char: 'Rock Lee',
    // Could use 117 (R number), 151 (old MV number), 38/39 (C/UC numbers)
    numbers: [117, 151, 38, 39],
    names: [
      'RockLee', 'Rock_Lee', 'Lee', 'Rocklee',
    ],
    titles: [
      'Loopy_Fist', 'Loopy', 'Drunken_Fist', 'Primary_Lotus',
      'Training', 'Taijutsu', 'Hidden_Lotus', 'Gates',
      'Lotus', 'Fifth_Gate', 'Eight_Gates',
    ],
  },
  {
    id: 'KS-135-MV',
    char: 'Sakura',
    // R Sakura is 109, internal MV is 135, C/UC are 11/12
    numbers: [109, 135, 11, 12],
    names: [
      'Sakura', 'Sakura_Haruno', 'SakuraHaruno', 'Haruno_Sakura',
    ],
    titles: [
      'Medical', 'Genin', 'Recovery_Team', 'Chakra_Prowess',
      'Inner_Sakura', 'Healing', 'Cherry_Blossom', 'Inner',
      'Looking_Right_at_Me', 'Hes_Looking', 'Looking',
      'Shannaroo', 'CHA', 'Punch',
    ],
  },
  {
    id: 'KS-136-MV',
    char: 'Sasuke',
    // R Sasuke is 110, internal MV is 136, C/UC are 13/14
    numbers: [110, 136, 13, 14],
    names: [
      'Sasuke', 'Sasuke_Uchiha', 'Sasuke_Uchiwa', 'SasukeUchiha',
      'SasukeUchiwa', 'Uchiha_Sasuke', 'Uchiwa_Sasuke',
    ],
    titles: [
      'Sharingan', 'Chidori', 'Annoying', 'Youre_Annoying',
      'You_Annoy_Me', 'Last', 'Avenger', 'Curse_Mark',
      'Heaven_Curse_Mark', 'Lightning', 'Genin',
      'Lion_Combo', 'Lions_Barrage',
    ],
  },
];

// --- URL GENERATION ---
function generateUrls() {
  const urls = new Set();
  const items = [];

  function add(url, cardId, char, detail) {
    if (!urls.has(url)) {
      urls.add(url);
      items.push({ url, cardId, char, detail });
    }
  }

  for (const card of TARGET_CARDS) {
    for (const num of card.numbers) {
      const pad = num < 10 ? `0${num}` : `${num}`;

      for (const name of card.names) {
        // === Proven simple pattern ===
        // {num}_M_{Name}-1920w.webp
        add(`${BASE}${num}_M_${name}-1920w.webp`, card.id, card.char, `${num}_M_${name}`);
        // Zero-padded: 09_M_Name
        if (num < 100) {
          add(`${BASE}${pad}_M_${name}-1920w.webp`, card.id, card.char, `${pad}_M_${name}`);
        }

        // === With trailing underscore (like Legendary) ===
        add(`${BASE}${num}_M_${name}_-1920w.webp`, card.id, card.char, `${num}_M_${name}_`);

        // === With titles ===
        for (const title of card.titles) {
          // {num}_M_{Name}_{Title}-1920w.webp
          add(`${BASE}${num}_M_${name}_${title}-1920w.webp`, card.id, card.char, `${num}_M_${name}_${title}`);
          // {num}_M_{Title}-1920w.webp (title only, no name)
          add(`${BASE}${num}_M_${title}-1920w.webp`, card.id, card.char, `${num}_M_${title}`);
        }

        // === M_Special pattern (like 143_M_Special_Itachi_Hunting) ===
        add(`${BASE}${num}_M_Special_${name}-1920w.webp`, card.id, card.char, `${num}_M_Special_${name}`);
        for (const title of card.titles) {
          add(`${BASE}${num}_M_Special_${name}_${title}-1920w.webp`, card.id, card.char, `${num}_M_Special_${name}_${title}`);
        }

        // === MV prefix (maybe they use MV instead of M for Mythos V?) ===
        add(`${BASE}${num}_MV_${name}-1920w.webp`, card.id, card.char, `${num}_MV_${name}`);
        add(`${BASE}${num}_Mythos_${name}-1920w.webp`, card.id, card.char, `${num}_Mythos_${name}`);
        add(`${BASE}${num}_MythosV_${name}-1920w.webp`, card.id, card.char, `${num}_MythosV_${name}`);
        add(`${BASE}${num}_Mythos_V_${name}-1920w.webp`, card.id, card.char, `${num}_Mythos_V_${name}`);

        // === V suffix pattern ===
        add(`${BASE}${num}_V_${name}-1920w.webp`, card.id, card.char, `${num}_V_${name}`);

        // === R_ART style (maybe MV uses similar?) ===
        add(`${BASE}${num}_M_ART_${name}-1920w.webp`, card.id, card.char, `${num}_M_ART_${name}`);
        for (const title of card.titles) {
          add(`${BASE}${num}_M_ART_${name}_${title}-1920w.webp`, card.id, card.char, `${num}_M_ART_${name}_${title}`);
        }

        // === Hyphen separator instead of underscore ===
        add(`${BASE}${num}_M_${name.replace(/_/g, '-')}-1920w.webp`, card.id, card.char, `${num}_M_${name.replace(/_/g, '-')}`);
      }
    }

    // === Also try WITHOUT number prefix ===
    for (const name of card.names) {
      add(`${BASE}M_${name}-1920w.webp`, card.id, card.char, `M_${name}`);
      add(`${BASE}MV_${name}-1920w.webp`, card.id, card.char, `MV_${name}`);
      add(`${BASE}Mythos_${name}-1920w.webp`, card.id, card.char, `Mythos_${name}`);
      for (const title of card.titles) {
        add(`${BASE}M_${name}_${title}-1920w.webp`, card.id, card.char, `M_${name}_${title}`);
      }
    }
  }

  return items;
}

// --- HTTP ENGINE ---
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
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(dest); } catch {}
      reject(err);
    });
  });
}

// --- MAIN ---
async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\n${C.bold}${C.cyan}  BRUTE17 - MISSING MV HUNTER${C.reset}`);
  console.log(`${C.dim}  Find CDN URLs for 4 missing Mythos V cards${C.reset}\n`);

  console.log(`  Target cards:`);
  for (const card of TARGET_CARDS) {
    const hasImage = card.id === 'KS-111-MV' || card.id === 'KS-117-MV';
    console.log(`    ${card.id} — ${card.char} ${hasImage ? '(has image, need CDN URL)' : '(no image)'}`);
  }
  console.log('');

  const allUrls = generateUrls();
  const total = allUrls.length;
  console.log(`  URLs to test: ${C.bold}${total.toLocaleString()}${C.reset}`);
  console.log(`  Concurrency:  ${C.bold}${CONCURRENCY}${C.reset}`);
  console.log('');

  const found = [];
  let tested = 0;
  let errors = 0;
  const startTime = Date.now();

  function showProgress() {
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = elapsed > 0 ? (tested / elapsed).toFixed(0) : 0;
    const pct = total > 0 ? ((tested / total) * 100).toFixed(1) : '0.0';
    process.stdout.write(
      `\r  ${C.dim}Progress:${C.reset} ${tested.toLocaleString()}/${total.toLocaleString()} (${pct}%) ` +
      `${C.dim}|${C.reset} ${rate}/s ` +
      `${C.dim}|${C.reset} ${C.green}Found: ${found.length}${C.reset} ` +
      `${C.dim}|${C.reset} Errors: ${errors}   `
    );
  }

  const progressInterval = setInterval(showProgress, 250);

  let idx = 0;
  async function worker() {
    while (idx < allUrls.length) {
      const item = allUrls[idx++];
      if (!item) break;

      try {
        const size = await headCheck(item.url);
        if (size > 0) {
          const filename = item.url.split('/').pop();
          const sizeKB = (size / 1024).toFixed(1);
          process.stdout.write(
            `\n  ${C.bold}${C.green}FOUND${C.reset} [${item.cardId}] ${item.char}: ${filename} (${sizeKB} KB)\n`
          );
          const destFile = path.join(OUT_DIR, filename);
          try {
            await downloadFile(item.url, destFile);
            process.stdout.write(`  ${C.dim}  -> Downloaded to ${destFile}${C.reset}\n`);
          } catch (dlErr) {
            process.stdout.write(`  ${C.yellow}  -> Download failed: ${dlErr.message}${C.reset}\n`);
          }
          found.push({ url: item.url, cardId: item.cardId, char: item.char, detail: item.detail, size, filename });
        }
      } catch {
        errors++;
      }
      tested++;
    }
  }

  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) workers.push(worker());
  await Promise.all(workers);

  clearInterval(progressInterval);
  showProgress();
  console.log('\n');

  // Report
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const reportLines = [
    '='.repeat(70),
    'BRUTE17 - MISSING MV HUNTER REPORT',
    `Date: ${new Date().toISOString()}`,
    '='.repeat(70),
    '',
    `Total URLs tested: ${total}`,
    `Time elapsed: ${elapsed}s`,
    `Errors: ${errors}`,
    `Images found: ${found.length}`,
    '',
    'Target cards:',
    ...TARGET_CARDS.map(c => `  ${c.id} — ${c.char} (numbers tried: ${c.numbers.join(', ')})`),
    '',
  ];

  if (found.length > 0) {
    reportLines.push('FOUND IMAGES:');
    reportLines.push('-'.repeat(70));
    for (const f of found) {
      reportLines.push(`  [${f.cardId}] ${f.char}: ${f.filename} (${(f.size / 1024).toFixed(1)} KB)`);
      reportLines.push(`    URL: ${f.url}`);
      reportLines.push(`    Pattern: ${f.detail}`);
    }
  } else {
    reportLines.push('No new MV images found.');
  }

  reportLines.push('', '='.repeat(70));
  fs.writeFileSync(REPORT_FILE, reportLines.join('\n'), 'utf8');

  console.log(`${C.bold}  RESULTS${C.reset}`);
  console.log(`  Tested:  ${total.toLocaleString()} URLs in ${elapsed}s`);
  console.log(`  Found:   ${C.bold}${C.green}${found.length}${C.reset} images`);
  console.log(`  Report:  ${REPORT_FILE}\n`);

  if (found.length > 0) {
    console.log(`${C.bold}${C.green}  FOUND:${C.reset}`);
    for (const f of found) {
      console.log(`    ${C.green}[${f.cardId}]${C.reset} ${f.filename} (${f.char})`);
    }
    console.log('');
  }

  agent.destroy();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
