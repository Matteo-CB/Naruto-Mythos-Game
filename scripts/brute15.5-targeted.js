#!/usr/bin/env node
/**
 * brute15.5-targeted.js  —  TARGETED PATTERN HUNTER
 *
 * Tests ONLY two proven URL patterns on the CDN:
 *
 *   1. Legendary:  Legendary_{Name}_-1920w.webp  (and without trailing underscore)
 *   2. MV cards:   {number}_M_{Name}-1920w.webp  (numbers 104-140)
 *
 * Both patterns are confirmed working. This script tests every character
 * with these exact formats — no mutations, no title variants, no guessing.
 *
 * Expected ~5600 URLs total. Should complete in under a minute.
 *
 * Usage:  node scripts/brute15.5-targeted.js
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ─── CONFIG ────────────────────────────────────────────────────────────────
const CONCURRENCY   = 200;
const TIMEOUT_MS    = 4000;
const MIN_FILE_SIZE = 4000;
const OUT_DIR       = path.join(__dirname, '..', 'newvisual');
const REPORT_FILE   = path.join(OUT_DIR, 'brute15.5_report.txt');

const BASE = 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/';

const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 500,
  maxFreeSockets: 100,
  timeout: TIMEOUT_MS,
});

// ─── ANSI ──────────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
};

// ─── ALL CHARACTERS WITH NAME VARIANTS ─────────────────────────────────────
const ALL_CHARACTERS = [
  { name: 'Naruto', variants: ['Naruto', 'Naruto_Uzumaki'] },
  { name: 'Sasuke', variants: ['Sasuke', 'Sasuke_Uchiha', 'Sasuke_Uchiwa'] },
  { name: 'Sakura', variants: ['Sakura', 'Sakura_Haruno'] },
  { name: 'Kakashi', variants: ['Kakashi', 'Kakashi_Hatake'] },
  { name: 'Itachi', variants: ['Itachi', 'Itachi_Uchiha', 'Itachi_Uchiwa'] },
  { name: 'Gaara', variants: ['Gaara'] },
  { name: 'Tsunade', variants: ['Tsunade'] },
  { name: 'Jiraiya', variants: ['Jiraiya', 'Jiraya'] },
  { name: 'Orochimaru', variants: ['Orochimaru'] },
  { name: 'Hinata', variants: ['Hinata', 'Hinata_Hyuga'] },
  { name: 'Shikamaru', variants: ['Shikamaru', 'Shikamaru_Nara'] },
  { name: 'Rock Lee', variants: ['RockLee', 'Rock_Lee', 'Lee'] },
  { name: 'Neji', variants: ['Neji', 'Neji_Hyuga'] },
  { name: 'Kiba', variants: ['Kiba', 'Kiba_Inuzuka'] },
  { name: 'Shino', variants: ['Shino', 'Shino_Aburame'] },
  { name: 'Temari', variants: ['Temari'] },
  { name: 'Kankuro', variants: ['Kankuro', 'Kankurou'] },
  { name: 'Zabuza', variants: ['Zabuza', 'Zabuza_Momochi'] },
  { name: 'Haku', variants: ['Haku'] },
  { name: 'Kisame', variants: ['Kisame', 'Kisame_Hoshigaki'] },
  { name: 'Kabuto', variants: ['Kabuto', 'Kabuto_Yakushi'] },
  { name: 'Kimimaro', variants: ['Kimimaro'] },
  { name: 'Tayuya', variants: ['Tayuya'] },
  { name: 'Sakon', variants: ['Sakon', 'Sakon_Ukon'] },
  { name: 'Ukon', variants: ['Ukon'] },
  { name: 'Jirobo', variants: ['Jirobo', 'Jiroubou'] },
  { name: 'Kidomaru', variants: ['Kidomaru', 'Kidoumaru'] },
  { name: 'Dosu', variants: ['Dosu', 'Dosu_Kinuta'] },
  { name: 'Zaku', variants: ['Zaku', 'Zaku_Abumi'] },
  { name: 'Kin', variants: ['Kin', 'Kin_Tsuchi'] },
  { name: 'Asuma', variants: ['Asuma', 'Asuma_Sarutobi'] },
  { name: 'Kurenai', variants: ['Kurenai', 'Yuhi_Kurenai'] },
  { name: 'Guy', variants: ['Guy', 'Gai', 'Gai_Maito', 'MightGuy', 'Might_Guy'] },
  { name: 'Tenten', variants: ['Tenten', 'Ten_Ten'] },
  { name: 'Choji', variants: ['Choji', 'Choji_Akimichi', 'Chouji'] },
  { name: 'Ino', variants: ['Ino', 'Ino_Yamanaka'] },
  { name: 'Hiruzen', variants: ['Hiruzen', 'Hiruzen_Sarutobi', 'Sarutobi'] },
  { name: 'Shizune', variants: ['Shizune'] },
  { name: 'Anko', variants: ['Anko', 'Anko_Mitarashi'] },
  { name: 'Ebisu', variants: ['Ebisu'] },
  { name: 'Iruka', variants: ['Iruka', 'Iruka_Umino'] },
  { name: 'Hayate', variants: ['Hayate', 'Hayate_Gekko'] },
  { name: 'Genma', variants: ['Genma', 'Genma_Shiranui'] },
  { name: 'Baki', variants: ['Baki'] },
  { name: 'Yashamaru', variants: ['Yashamaru'] },
  { name: 'Pakkun', variants: ['Pakkun'] },
  { name: 'Akamaru', variants: ['Akamaru'] },
  { name: 'Gamabunta', variants: ['Gamabunta', 'Gama_Bunta'] },
  { name: 'Gamahiro', variants: ['Gamahiro'] },
  { name: 'Gamakichi', variants: ['Gamakichi'] },
  { name: 'Gamatatsu', variants: ['Gamatatsu'] },
  { name: 'Katsuyu', variants: ['Katsuyu'] },
  { name: 'TonTon', variants: ['TonTon', 'Ton_Ton'] },
  { name: 'Ninja Hound', variants: ['Ninja_Hound', 'Ninja_Hounds'] },
  { name: 'Kyubi', variants: ['Kyubi', 'Kyuubi', 'Kurama', 'Nine_Tails'] },
  { name: 'Shukaku', variants: ['Shukaku', 'Ichibi', 'One_Tail'] },
  { name: 'Manda', variants: ['Manda'] },
  { name: 'Rasa', variants: ['Rasa'] },
  { name: 'Doki', variants: ['Doki'] },
  { name: 'Kyodaigumo', variants: ['Kyodaigumo', 'Giant_Spider'] },
  { name: 'Rashomon', variants: ['Rashomon', 'Rempart'] },
];

// Legendary prefix variants
const LEGENDARY_PREFIXES = ['Legendary', 'LEGENDARY', 'Legend', 'Gold', 'GOLD'];

// ─── URL GENERATION ────────────────────────────────────────────────────────

function generateAllUrls() {
  const urls = [];

  // ── Pattern 1: Legendary ──
  // Format A: {Prefix}_{Name}_-1920w.webp  (trailing underscore before -1920w)
  // Format B: {Prefix}_{Name}-1920w.webp   (no trailing underscore)
  for (const char of ALL_CHARACTERS) {
    for (const prefix of LEGENDARY_PREFIXES) {
      for (const nameVar of char.variants) {
        // With trailing underscore: Legendary_Kabuto_-1920w.webp
        urls.push({
          url: `${BASE}${prefix}_${nameVar}_-1920w.webp`,
          char: char.name,
          type: 'legendary',
        });
        // Without trailing underscore: Legendary_Kabuto-1920w.webp
        urls.push({
          url: `${BASE}${prefix}_${nameVar}-1920w.webp`,
          char: char.name,
          type: 'legendary',
        });
      }
    }
  }

  // ── Pattern 2: MV cards ──
  // Format: {number}_M_{Name}-1920w.webp
  // Test numbers 104-140 (R + S range) with all characters
  for (let num = 104; num <= 140; num++) {
    for (const char of ALL_CHARACTERS) {
      for (const nameVar of char.variants) {
        urls.push({
          url: `${BASE}${num}_M_${nameVar}-1920w.webp`,
          char: char.name,
          type: 'mv',
          number: num,
        });
      }
    }
  }

  return urls;
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

// ─── MAIN ──────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\n${C.bold}${C.cyan}  BRUTE15.5-TARGETED${C.reset}`);
  console.log(`${C.dim}  Proven-pattern image hunter: Legendary + MV cards${C.reset}\n`);

  const allUrls = generateAllUrls();
  const total = allUrls.length;
  console.log(`  URLs to test: ${C.bold}${total.toLocaleString()}${C.reset}`);
  console.log(`  Concurrency:  ${C.bold}${CONCURRENCY}${C.reset}`);
  console.log(`  Patterns:     Legendary_{Name}[_]-1920w.webp + {num}_M_{Name}-1920w.webp`);
  console.log('');

  const found = [];
  let tested = 0;
  let errors = 0;
  const startTime = Date.now();

  // Progress display
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

  // Worker pool
  let idx = 0;

  async function worker() {
    while (idx < allUrls.length) {
      const item = allUrls[idx++];
      if (!item) break;

      try {
        const size = await headCheck(item.url);
        if (size > 0) {
          // FOUND! Print immediately
          const filename = item.url.split('/').pop();
          const sizeKB = (size / 1024).toFixed(1);
          process.stdout.write(
            `\n  ${C.bold}${C.green}FOUND${C.reset} [${item.type}] ${item.char}: ${filename} (${sizeKB} KB)\n`
          );

          // Download
          const destFile = path.join(OUT_DIR, filename);
          try {
            await downloadFile(item.url, destFile);
            process.stdout.write(`  ${C.dim}  -> Downloaded to ${destFile}${C.reset}\n`);
          } catch (dlErr) {
            process.stdout.write(`  ${C.yellow}  -> Download failed: ${dlErr.message}${C.reset}\n`);
          }

          found.push({
            url: item.url,
            char: item.char,
            type: item.type,
            number: item.number || null,
            size,
            filename,
          });
        }
      } catch {
        errors++;
      }

      tested++;
    }
  }

  // Launch workers
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  clearInterval(progressInterval);
  showProgress();
  console.log('\n');

  // ─── REPORT ────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const reportLines = [
    '='.repeat(70),
    'BRUTE15.5-TARGETED REPORT',
    `Date: ${new Date().toISOString()}`,
    '='.repeat(70),
    '',
    `Total URLs tested: ${total}`,
    `Time elapsed: ${elapsed}s`,
    `Errors: ${errors}`,
    `Images found: ${found.length}`,
    '',
  ];

  if (found.length > 0) {
    reportLines.push('FOUND IMAGES:');
    reportLines.push('-'.repeat(70));
    for (const f of found) {
      const sizeKB = (f.size / 1024).toFixed(1);
      reportLines.push(`  [${f.type}] ${f.char}${f.number ? ' #' + f.number : ''}: ${f.filename} (${sizeKB} KB)`);
      reportLines.push(`    URL: ${f.url}`);
    }
  } else {
    reportLines.push('No new images found.');
  }

  reportLines.push('');
  reportLines.push('='.repeat(70));

  const reportText = reportLines.join('\n');
  fs.writeFileSync(REPORT_FILE, reportText, 'utf8');

  console.log(`${C.bold}  RESULTS${C.reset}`);
  console.log(`${C.dim}  ${'─'.repeat(50)}${C.reset}`);
  console.log(`  Tested:  ${total.toLocaleString()} URLs in ${elapsed}s`);
  console.log(`  Found:   ${C.bold}${C.green}${found.length}${C.reset} images`);
  console.log(`  Errors:  ${errors}`);
  console.log(`  Report:  ${REPORT_FILE}`);
  console.log('');

  if (found.length > 0) {
    console.log(`${C.bold}${C.green}  FOUND IMAGES:${C.reset}`);
    for (const f of found) {
      console.log(`    ${f.type === 'legendary' ? C.yellow : C.green}${f.filename}${C.reset} (${f.char})`);
    }
    console.log('');
  }

  agent.destroy();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
